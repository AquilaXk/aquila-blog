package com.back.boundedContexts.member.adapter.`in`.web

import com.back.boundedContexts.member.application.port.`in`.CurrentMemberProfileQueryUseCase
import com.back.boundedContexts.member.application.port.`in`.MemberUseCase
import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.application.service.AuthTokenService
import com.back.boundedContexts.member.application.service.LoginAttemptService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.global.app.AppConfig
import com.back.global.exception.app.AppException
import com.back.global.rsData.RsData
import com.back.global.security.domain.SecurityUser
import com.back.global.web.app.AuthCookieService
import jakarta.servlet.http.HttpServletRequest
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
    private val actorApplicationService: ActorApplicationService,
    private val authTokenService: AuthTokenService,
    private val authCookieService: AuthCookieService,
    private val loginAttemptService: LoginAttemptService,
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
    )

    @PostMapping("/login")
    @Transactional(readOnly = true)
    fun login(
        request: HttpServletRequest,
        @RequestBody @Valid reqBody: MemberLoginRequest,
    ): RsData<MemberLoginResBody> {
        val username = reqBody.username.trim()
        val clientIp = extractClientIp(request)

        if (loginAttemptService.isBlocked(username, clientIp)) {
            throw AppException("429-1", "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.")
        }

        val authCandidate =
            actorApplicationService
                .findByUsername(username)
                ?.takeIf { isPasswordValid(it, reqBody.password) }
                ?: run {
                    val blocked = loginAttemptService.recordFailure(username, clientIp)
                    if (blocked) throw AppException("429-1", "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.")
                    throw AppException("401-1", "아이디 또는 비밀번호가 올바르지 않습니다.")
                }

        val member =
            memberUseCase
                .findById(authCandidate.id)
                .orElseThrow { AppException("404-1", "회원을 찾을 수 없습니다.") }

        loginAttemptService.clear(username, clientIp)

        val accessToken = authTokenService.genAccessToken(member)

        authCookieService.issueAuthCookies(member.apiKey, accessToken)

        return RsData(
            "200-1",
            "${member.nickname}님 환영합니다.",
            MemberLoginResBody(
                item = MemberDto(member),
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

    private fun isPasswordValid(
        member: Member,
        rawPassword: String,
    ): Boolean =
        if (member.username == AppConfig.adminUsernameOrBlank && AppConfig.adminPasswordOrBlank.isNotBlank()) {
            rawPassword == AppConfig.adminPasswordOrBlank
        } else {
            runCatching {
                memberUseCase.checkPassword(member, rawPassword)
            }.isSuccess
        }

    private fun extractClientIp(request: HttpServletRequest): String {
        val xForwardedFor = request.getHeader("X-Forwarded-For").orEmpty()
        if (xForwardedFor.isNotBlank()) {
            return xForwardedFor
                .split(",")
                .firstOrNull()
                .orEmpty()
                .trim()
                .ifBlank { request.remoteAddr.orEmpty() }
        }

        val xRealIp = request.getHeader("X-Real-IP").orEmpty().trim()
        if (xRealIp.isNotBlank()) return xRealIp

        return request.remoteAddr.orEmpty()
    }
}
