package com.back.global.security.config

import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot
import com.back.global.exception.application.AppException
import com.back.global.web.application.AuthCookieService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.time.Instant

private const val MEMBER_SESSION_AUTH_MAX_PATH_LENGTH = 512
private val MEMBER_SESSION_AUTH_LOG_CONTROL_CHAR_REGEX = Regex("[\\x00-\\x1F\\x7F]")

@Component
class MemberSessionAuthenticationResolver(
    private val memberSessionUseCase: MemberSessionUseCase,
    private val authCookieService: AuthCookieService,
    @param:Value("\${custom.auth.session.freshLookupGraceSeconds:15}")
    private val freshLookupGraceSeconds: Long,
) {
    private val log = org.slf4j.LoggerFactory.getLogger(MemberSessionAuthenticationResolver::class.java)

    fun resolve(
        memberId: Long,
        cookieSessionKey: String,
        tokenSessionKey: String?,
        payload: AccessTokenPayload?,
        request: HttpServletRequest,
    ): MemberSessionResolution {
        val effectiveSessionKey =
            when {
                cookieSessionKey.isNotBlank() -> cookieSessionKey
                !tokenSessionKey.isNullOrBlank() -> tokenSessionKey
                else -> ""
            }.trim()

        if (effectiveSessionKey.isBlank()) {
            return MemberSessionResolution(sessionKeyProvided = false, session = null)
        }

        val resolution =
            MemberSessionResolution(
                sessionKeyProvided = true,
                session = memberSessionUseCase.findActiveSessionSnapshot(memberId, effectiveSessionKey),
            )

        if (resolution.session != null || !resolution.sessionKeyProvided) return resolution
        if (!canUseFreshTokenSessionFallback(request, payload, cookieSessionKey, effectiveSessionKey)) return resolution

        log.info(
            "auth_session_fresh_token_fallback path={} memberId={} graceSeconds={}",
            sanitizeLogValue(request.requestURI, MEMBER_SESSION_AUTH_MAX_PATH_LENGTH),
            memberId,
            freshLookupGraceSeconds,
        )

        return resolution.copy(freshTokenFallback = true)
    }

    fun ensureUsable(
        sessionResolution: MemberSessionResolution,
        requireSession: Boolean = false,
    ) {
        if (!sessionResolution.sessionKeyProvided && requireSession) {
            authCookieService.expireAuthCookies()
            throw AppException("401-8", "세션이 만료되었습니다. 다시 로그인해주세요.")
        }

        if (sessionResolution.sessionKeyProvided && sessionResolution.session == null && !sessionResolution.freshTokenFallback) {
            authCookieService.expireAuthCookies()
            throw AppException("401-8", "세션이 만료되었습니다. 다시 로그인해주세요.")
        }
    }

    fun context(
        sessionResolution: MemberSessionResolution,
        fallbackRememberLoginEnabled: Boolean,
        fallbackIpSecurityEnabled: Boolean,
        fallbackIpSecurityFingerprint: String?,
    ): AuthenticationSessionContext {
        val memberSession = sessionResolution.session
        return AuthenticationSessionContext(
            session = memberSession,
            rememberLoginEnabled = memberSession?.rememberLoginEnabled ?: fallbackRememberLoginEnabled,
            ipSecurityEnabled = memberSession?.ipSecurityEnabled ?: fallbackIpSecurityEnabled,
            ipSecurityFingerprint = memberSession?.ipSecurityFingerprint ?: fallbackIpSecurityFingerprint,
        )
    }

    private fun canUseFreshTokenSessionFallback(
        request: HttpServletRequest,
        payload: AccessTokenPayload?,
        cookieSessionKey: String,
        effectiveSessionKey: String,
    ): Boolean {
        if (payload == null) return false
        if (freshLookupGraceSeconds <= 0) return false
        if (!AuthRequestMethodPolicy.isSafeRead(request)) return false
        if (cookieSessionKey.isBlank() || effectiveSessionKey.isBlank()) return false
        if (payload.sessionKey.isNullOrBlank() || payload.sessionKey != effectiveSessionKey) return false

        val issuedAt = payload.issuedAt ?: return false
        return !Instant.now().isAfter(issuedAt.plusSeconds(freshLookupGraceSeconds))
    }

    private fun sanitizeLogValue(
        raw: String?,
        maxLength: Int,
    ): String {
        if (raw.isNullOrBlank()) return "-"

        val sanitized =
            raw
                .replace('\r', ' ')
                .replace('\n', ' ')
                .replace('\t', ' ')
                .replace(MEMBER_SESSION_AUTH_LOG_CONTROL_CHAR_REGEX, "?")
                .trim()

        if (sanitized.isBlank()) return "-"
        return sanitized.take(maxLength)
    }
}

data class MemberSessionResolution(
    val sessionKeyProvided: Boolean,
    val session: MemberSessionAuthSnapshot?,
    val freshTokenFallback: Boolean = false,
)

data class AuthenticationSessionContext(
    val session: MemberSessionAuthSnapshot?,
    val rememberLoginEnabled: Boolean,
    val ipSecurityEnabled: Boolean,
    val ipSecurityFingerprint: String?,
)
