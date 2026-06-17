package com.back.global.security.config

import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.global.exception.application.AppException
import com.back.global.security.application.AuthIpSecurityService
import com.back.global.security.application.AuthSecurityEventService
import com.back.global.web.application.AuthCookieService
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions

@DisplayName("AuthIpSecurityVerifier 테스트")
class AuthIpSecurityVerifierTest {
    private val authIpSecurityService = mock(AuthIpSecurityService::class.java)
    private val authSecurityEventService = mock(AuthSecurityEventService::class.java)
    private val authCookieService = mock(AuthCookieService::class.java)
    private val memberSessionUseCase = mock(MemberSessionUseCase::class.java)
    private val verifier =
        AuthIpSecurityVerifier(
            authIpSecurityService = authIpSecurityService,
            authSecurityEventService = authSecurityEventService,
            authCookieService = authCookieService,
            memberSessionUseCase = memberSessionUseCase,
        )

    @Test
    @DisplayName("IP 보안이 비활성화된 인증 흐름은 fingerprint 검증을 건너뛴다")
    fun skipWhenIpSecurityDisabled() {
        // given
        val check = check(ipSecurityEnabled = false)

        // when
        verifier.verify(check, clientIp = "203.0.113.10")

        // then
        verifyNoInteractions(authIpSecurityService)
        verifyNoInteractions(authSecurityEventService)
        verifyNoInteractions(authCookieService)
        verifyNoInteractions(memberSessionUseCase)
    }

    @Test
    @DisplayName("IP 보안 fingerprint가 일치하지 않으면 이벤트를 기록하고 인증 쿠키를 만료한다")
    fun blockMismatchAndExpireAuthCookies() {
        // given
        val check = check(reason = "token-payload-ip-mismatch")
        given(authIpSecurityService.matches("expected-fingerprint", "203.0.113.11")).willReturn(false)

        // when
        val exception = assertThrows<AppException> { verifier.verify(check, clientIp = "203.0.113.11") }

        // then
        assertThat(exception.rsData.resultCode).isEqualTo("401-7")
        verify(authSecurityEventService).recordIpSecurityMismatchBlocked(
            memberId = 54L,
            loginIdentifier = "admin@test.com",
            rememberLoginEnabled = true,
            ipSecurityEnabled = true,
            expectedIpFingerprint = "expected-fingerprint",
            requestPath = "/member/api/v1/auth/me",
            reason = "token-payload-ip-mismatch",
        )
        verify(authCookieService).expireAuthCookies()
        verify(memberSessionUseCase, never()).revokeSession("session-key")
    }

    @Test
    @DisplayName("refreshToken 회전 경로의 IP 보안 실패는 세션을 폐기한다")
    fun revokeSessionOnRefreshTokenMismatch() {
        // given
        val check =
            check(
                reason = "refresh-token-ip-mismatch",
                revokeSessionKey = "session-key",
            )
        given(authIpSecurityService.matches("expected-fingerprint", "203.0.113.12")).willReturn(false)

        // when
        val exception = assertThrows<AppException> { verifier.verify(check, clientIp = "203.0.113.12") }

        // then
        assertThat(exception.rsData.resultCode).isEqualTo("401-7")
        verify(memberSessionUseCase).revokeSession("session-key")
        verify(authCookieService).expireAuthCookies()
    }

    private fun check(
        reason: String = "token-payload-ip-mismatch",
        ipSecurityEnabled: Boolean = true,
        revokeSessionKey: String? = null,
    ): AuthIpSecurityCheck =
        AuthIpSecurityCheck(
            memberId = 54L,
            loginIdentifier = "admin@test.com",
            rememberLoginEnabled = true,
            ipSecurityEnabled = ipSecurityEnabled,
            expectedIpFingerprint = "expected-fingerprint",
            requestPath = "/member/api/v1/auth/me",
            reason = reason,
            revokeSessionKey = revokeSessionKey,
        )
}
