package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.port.input.ActorQueryUseCase
import com.back.boundedContexts.member.application.port.input.AuthTokenIssueUseCase
import com.back.boundedContexts.member.application.port.input.CurrentMemberProfileQueryUseCase
import com.back.boundedContexts.member.application.port.input.LoginAttemptPolicyUseCase
import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.global.exception.application.AppException
import com.back.global.rsData.RsData
import com.back.global.security.domain.SecurityUser
import com.back.global.web.application.AuthCookieService
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

/**
 * ApiV1AuthController는 웹 계층에서 HTTP 요청/응답을 처리하는 클래스입니다.
 * 입력 DTO 검증과 응답 포맷팅을 담당하고 비즈니스 처리는 애플리케이션 계층에 위임합니다.
 */
@RestController
@RequestMapping("/member/api/v1/auth")
class ApiV1AuthController(
    private val currentMemberProfileQueryUseCase: CurrentMemberProfileQueryUseCase,
    private val memberUseCase: MemberUseCase,
    private val actorQueryUseCase: ActorQueryUseCase,
    private val authTokenIssueUseCase: AuthTokenIssueUseCase,
    private val authCookieService: AuthCookieService,
    private val loginAttemptPolicyUseCase: LoginAttemptPolicyUseCase,
) {
    data class MemberLoginRequest(
        @field:NotBlank
        @field:Size(min = 2, max = 30)
        val username: String,
        @field:NotBlank
        @field:Size(max = 128)
        val password: String,
    )

    data class MemberLoginResBody(
        val item: MemberDto,
    )

    /**
     * 로그인 요청을 처리하고 인증/잠금 정책을 반영합니다.
     * 컨트롤러 계층에서 요청 DTO를 검증한 뒤 서비스 호출 결과를 응답 규격으로 변환합니다.
     */
    @PostMapping("/login")
    @Transactional
    fun login(
        request: HttpServletRequest,
        @RequestBody @Valid reqBody: MemberLoginRequest,
    ): RsData<MemberLoginResBody> {
        val username = reqBody.username.trim()
        val clientIp = extractClientIp(request)

        if (loginAttemptPolicyUseCase.isBlocked(username, clientIp)) {
            throw AppException("429-1", "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.")
        }

        val authCandidate =
            actorQueryUseCase
                .findByUsername(username)
                ?.takeIf { isPasswordValid(it, reqBody.password) }
                ?: run {
                    val blocked = loginAttemptPolicyUseCase.recordFailure(username, clientIp)
                    if (blocked) throw AppException("429-1", "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.")
                    throw AppException("401-1", "아이디 또는 비밀번호가 올바르지 않습니다.")
                }

        val member =
            memberUseCase
                .findById(authCandidate.id)
                .orElseThrow { AppException("404-1", "회원을 찾을 수 없습니다.") }

        loginAttemptPolicyUseCase.clear(username, clientIp)

        // 로그인 성공 시 장기 인증 식별자(apiKey)를 회전해 탈취된 기존 키 재사용 위험을 줄인다.
        member.modifyApiKey(MemberPolicy.genApiKey())
        val accessToken = authTokenIssueUseCase.genAccessToken(member)

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
        runCatching {
            memberUseCase.checkPassword(member, rawPassword)
        }.isSuccess

    private fun extractClientIp(request: HttpServletRequest): String {
        // 애플리케이션 레이어에서 임의의 X-Forwarded-* 헤더를 직접 신뢰하지 않는다.
        // reverse proxy가 이미 정규화한 remoteAddr를 기준으로 식별한다.
        return request.remoteAddr.orEmpty()
    }
}
