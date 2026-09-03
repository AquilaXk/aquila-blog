package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.port.input.AdminEmailAuthenticationUseCase
import com.back.boundedContexts.member.application.port.input.CurrentMemberProfileQueryUseCase
import com.back.boundedContexts.member.dto.AuthSessionMemberDto
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.rsData.RsData
import com.back.global.security.application.AuthSecurityEventService
import com.back.global.security.config.AuthCookieNames
import com.back.global.security.domain.SecurityUser
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.ClientIpResolver
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.Locale

@RestController
@RequestMapping("/member/api/v1/auth")
class ApiV1AuthController(
    private val currentMemberProfileQueryUseCase: CurrentMemberProfileQueryUseCase,
    private val authSecurityEventService: AuthSecurityEventService,
    private val authCookieService: AuthCookieService,
    private val clientIpResolver: ClientIpResolver,
    private val memberSessionUseCase: MemberSessionUseCase,
    private val adminEmailAuthenticationUseCase: AdminEmailAuthenticationUseCase,
) {
    companion object {
        private const val ADMIN_EMAIL_CODE_LENGTH = 8
        private const val MAX_EMAIL_LENGTH = 320
        private val EMAIL_FORMAT_REGEX =
            Regex(
                "^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$",
            )
    }

    data class MemberLoginResBody(
        val item: AuthSessionMemberDto,
    )

    data class AdminEmailCodeRequest(
        @field:NotBlank
        @field:Size(max = MAX_EMAIL_LENGTH)
        val email: String,
        val rememberMe: Boolean = false,
    )

    data class AdminEmailCodeRequestResBody(
        val challengeId: String,
        val expiresInSeconds: Long,
    )

    data class AdminEmailCodeVerifyRequest(
        @field:NotBlank
        @field:Size(min = 20, max = 128)
        val challengeId: String,
        @field:NotBlank
        @field:Size(min = ADMIN_EMAIL_CODE_LENGTH, max = ADMIN_EMAIL_CODE_LENGTH)
        @field:Pattern(regexp = "\\d{8}")
        val code: String,
    )

    @PostMapping("/admin-email/request")
    fun requestAdminEmailCode(
        @RequestBody @Valid reqBody: AdminEmailCodeRequest,
    ): RsData<AdminEmailCodeRequestResBody> {
        val requested =
            adminEmailAuthenticationUseCase.requestCode(
                email = resolveEmail(reqBody.email),
                rememberMe = reqBody.rememberMe,
            )
        return RsData(
            "200-1",
            "인증 코드를 전송했습니다.",
            AdminEmailCodeRequestResBody(
                challengeId = requested.challengeId,
                expiresInSeconds = requested.expiresInSeconds,
            ),
        )
    }

    @PostMapping("/admin-email/verify")
    fun verifyAdminEmailCode(
        request: HttpServletRequest,
        @RequestBody @Valid reqBody: AdminEmailCodeVerifyRequest,
    ): RsData<MemberLoginResBody> {
        val issued =
            adminEmailAuthenticationUseCase.verifyCode(
                challengeId = reqBody.challengeId,
                code = reqBody.code,
                createdIp = extractClientIp(request),
                userAgent = request.getHeader("User-Agent"),
            )
        authCookieService.issueAuthCookies(
            apiKey = issued.apiKey,
            accessToken = issued.accessToken,
            refreshToken = issued.refreshToken,
            sessionKey = issued.sessionKey,
            rememberLoginEnabled = issued.rememberLoginEnabled,
        )
        runCatching {
            authSecurityEventService.recordLoginPolicyApplied(
                member = issued.member,
                loginIdentifier = "admin-email",
                requestPath = request.requestURI,
            )
        }
        return RsData(
            "200-1",
            "${issued.member.nickname}님 환영합니다.",
            MemberLoginResBody(AuthSessionMemberDto(issued.member)),
        )
    }

    @DeleteMapping("/logout")
    fun logout(request: HttpServletRequest): RsData<Void> {
        val sessionKeyCookie =
            request.cookies
                ?.firstOrNull { it.name == AuthCookieNames.SESSION_KEY }
                ?.value
                ?.trim()
                .orEmpty()
        if (sessionKeyCookie.isNotBlank()) {
            memberSessionUseCase.revokeSession(sessionKeyCookie)
        }
        authCookieService.expireAuthCookies()
        return RsData("200-1", "로그아웃 되었습니다.")
    }

    @GetMapping("/me")
    @Transactional(readOnly = true)
    fun me(
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): MemberWithUsernameDto = currentMemberProfileQueryUseCase.getPublishedById(securityUser.id)

    @GetMapping("/session")
    @Transactional(readOnly = true)
    fun session(
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): AuthSessionMemberDto = AuthSessionMemberDto(securityUser)

    private fun extractClientIp(request: HttpServletRequest): String {
        // 신뢰 프록시 구간(Cloudflared/Caddy)에서는 전달 헤더로 원본 클라이언트 IP를 복원한다.
        // 프록시 외부에서 직접 들어온 요청은 remoteAddr를 사용해 header spoofing을 차단한다.
        return clientIpResolver.resolve(request)
    }

    private fun resolveEmail(rawEmail: String): String {
        val trimmedEmail = rawEmail.trim()

        if (trimmedEmail.isBlank()) throw AppException(ErrorCode.BAD_REQUEST, "이메일을 입력해주세요.")
        if (trimmedEmail.length > MAX_EMAIL_LENGTH) throw AppException(ErrorCode.MEMBER_BAD_REQUEST, "이메일 형식을 확인해주세요.")

        val normalized = trimmedEmail.lowercase(Locale.ROOT)
        if (!EMAIL_FORMAT_REGEX.matches(normalized)) throw AppException(ErrorCode.MEMBER_BAD_REQUEST, "이메일 형식을 확인해주세요.")

        return normalized
    }
}
