package com.back.global.security.config

import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.global.exception.application.AppException
import com.back.global.security.application.AuthIpSecurityService
import com.back.global.security.application.AuthSecurityEventService
import com.back.global.web.application.AuthCookieService
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

data class AuthIpSecurityCheck(
    val memberId: Long?,
    val loginIdentifier: String?,
    val rememberLoginEnabled: Boolean,
    val ipSecurityEnabled: Boolean,
    val expectedIpFingerprint: String?,
    val requestPath: String,
    val reason: String,
    val revokeSessionKey: String? = null,
)

/**
 * IP 보안 mismatch를 검증하고 차단 side effect를 한 곳에서 처리합니다.
 */
@Component
class AuthIpSecurityVerifier(
    private val authIpSecurityService: AuthIpSecurityService,
    private val authSecurityEventService: AuthSecurityEventService,
    private val authCookieService: AuthCookieService,
    private val memberSessionUseCase: MemberSessionUseCase,
) {
    private val log = LoggerFactory.getLogger(AuthIpSecurityVerifier::class.java)

    fun verify(
        check: AuthIpSecurityCheck,
        clientIp: String,
    ) {
        if (!check.ipSecurityEnabled) return
        if (authIpSecurityService.matches(check.expectedIpFingerprint, clientIp)) return

        recordMismatch(check)
        check.revokeSessionKey?.let(memberSessionUseCase::revokeSession)
        authCookieService.expireAuthCookies()
        throw AppException("401-7", "IP 보안 검증에 실패했습니다. 다시 로그인해주세요.")
    }

    private fun recordMismatch(check: AuthIpSecurityCheck) {
        runCatching {
            authSecurityEventService.recordIpSecurityMismatchBlocked(
                memberId = check.memberId,
                loginIdentifier = check.loginIdentifier,
                rememberLoginEnabled = check.rememberLoginEnabled,
                ipSecurityEnabled = check.ipSecurityEnabled,
                expectedIpFingerprint = check.expectedIpFingerprint,
                requestPath = check.requestPath,
                reason = check.reason,
            )
        }.onFailure { exception ->
            log.warn("auth_security_event_record_failed reason={}", check.reason, exception)
        }
    }
}
