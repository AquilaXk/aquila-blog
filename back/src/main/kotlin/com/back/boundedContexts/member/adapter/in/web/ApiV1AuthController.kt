package com.back.boundedContexts.member.adapter.`in`.web

import com.back.boundedContexts.member.application.port.`in`.CurrentMemberProfileQueryUseCase
import com.back.boundedContexts.member.application.port.`in`.MemberUseCase
import com.back.boundedContexts.member.application.service.AuthTokenService
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.global.app.AppConfig
import com.back.global.exception.app.AppException
import com.back.global.rsData.RsData
import com.back.global.security.domain.SecurityUser
import com.back.global.web.app.AuthCookieService
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/member/api/v1/auth")
class ApiV1AuthController(
    private val currentMemberProfileQueryUseCase: CurrentMemberProfileQueryUseCase,
    private val memberUseCase: MemberUseCase,
    private val authTokenService: AuthTokenService,
    private val authCookieService: AuthCookieService,
) {
    data class MemberLoginRequest(
        @field:NotBlank
        @field:Size(min = 2, max = 30)
        val username: String,
        @field:NotBlank
        @field:Size(min = 2, max = 30)
        val password: String,
    )

    data class MemberLoginResBody(
        val item: MemberDto,
        val apiKey: String,
        val accessToken: String,
    )

    @PostMapping("/login")
    @Transactional(readOnly = true)
    fun login(
        @RequestBody @Valid reqBody: MemberLoginRequest,
    ): RsData<MemberLoginResBody> {
        val member =
            memberUseCase.findByUsername(reqBody.username)
                ?: throw AppException("401-1", "존재하지 않는 아이디입니다.")

        if (member.username == AppConfig.adminUsernameOrBlank && AppConfig.adminPasswordOrBlank.isNotBlank()) {
            if (reqBody.password != AppConfig.adminPasswordOrBlank) {
                throw AppException("401-2", "비밀번호가 일치하지 않습니다.")
            }
        } else {
            memberUseCase.checkPassword(member, reqBody.password)
        }

        val accessToken = authTokenService.genAccessToken(member)

        authCookieService.issueAuthCookies(member.apiKey, accessToken)

        return RsData(
            "200-1",
            "${member.nickname}님 환영합니다.",
            MemberLoginResBody(
                item = MemberDto(member),
                apiKey = member.apiKey,
                accessToken = accessToken,
            ),
        )
    }

    @DeleteMapping("/logout")
    fun logout(): RsData<Void> {
        authCookieService.expireAuthCookies()
        return RsData("200-1", "로그아웃 되었습니다.")
    }

    @GetMapping("/me")
    @Transactional(readOnly = true)
    fun me(
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): MemberWithUsernameDto = currentMemberProfileQueryUseCase.getById(securityUser.id)
}
