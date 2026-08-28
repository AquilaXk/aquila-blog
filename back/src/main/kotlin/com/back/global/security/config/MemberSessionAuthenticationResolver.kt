package com.back.global.security.config

import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.web.application.AuthCookieService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.stereotype.Component

@Component
class MemberSessionAuthenticationResolver(
    private val memberSessionUseCase: MemberSessionUseCase,
    private val authCookieService: AuthCookieService,
) {
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

        return MemberSessionResolution(
            sessionKeyProvided = true,
            session = memberSessionUseCase.findActiveSessionSnapshot(memberId, effectiveSessionKey),
        )
    }

    fun ensureUsable(
        sessionResolution: MemberSessionResolution,
        requireSession: Boolean = false,
    ) {
        if (!sessionResolution.sessionKeyProvided && requireSession) {
            throw expiredSessionException()
        }

        if (sessionResolution.sessionKeyProvided && sessionResolution.session == null) {
            throw expiredSessionException()
        }
    }

    fun expiredSessionException(): AppException {
        authCookieService.expireAuthCookies()
        return AppException(ErrorCode.SESSION_EXPIRED, "세션이 만료되었습니다. 다시 로그인해주세요.")
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
}

data class MemberSessionResolution(
    val sessionKeyProvided: Boolean,
    val session: MemberSessionAuthSnapshot?,
)

data class AuthenticationSessionContext(
    val session: MemberSessionAuthSnapshot?,
    val rememberLoginEnabled: Boolean,
    val ipSecurityEnabled: Boolean,
    val ipSecurityFingerprint: String?,
)
