package com.back.global.security.config

import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import com.back.boundedContexts.member.model.shared.Member
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import com.back.global.exception.application.AppException
import com.back.global.web.application.AuthCookieService
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.springframework.mock.web.MockHttpServletRequest
import java.time.Instant

@DisplayName("MemberSessionAuthenticationResolver 테스트")
class MemberSessionAuthenticationResolverTest {
    private val memberSessionUseCase = mock(MemberSessionUseCase::class.java)
    private val authCookieService = mock(AuthCookieService::class.java)
    private val resolver = MemberSessionAuthenticationResolver(memberSessionUseCase, authCookieService)

    @Test
    fun `prefers a cookie session key and falls back to a token session key`() {
        val cookieSession = activeSession("cookie-session")
        val tokenSession = activeSession("token-session")
        given(memberSessionUseCase.findActiveSession(7L, "cookie-session")).willReturn(cookieSession)
        given(memberSessionUseCase.findActiveSession(7L, "token-session")).willReturn(tokenSession)

        val cookieResolution = resolve(cookie = " cookie-session ", token = "token-session")
        val tokenResolution = resolve(cookie = "", token = " token-session ")

        assertThat(cookieResolution.session?.sessionKey).isEqualTo("cookie-session")
        assertThat(tokenResolution.session?.sessionKey).isEqualTo("token-session")
        verify(memberSessionUseCase).findActiveSession(7L, "cookie-session")
        verify(memberSessionUseCase).findActiveSession(7L, "token-session")
    }

    @Test
    fun `maps blank active and missing sessions without treating blank as a provided session`() {
        val active = activeSession("active-session")
        given(memberSessionUseCase.findActiveSession(7L, "active-session")).willReturn(active)
        given(memberSessionUseCase.findActiveSession(7L, "missing-session")).willReturn(null)

        assertThat(resolve(cookie = " ", token = null)).isEqualTo(MemberSessionResolution(false, null))
        assertThat(resolve(cookie = "active-session", token = null).session?.id).isEqualTo(active.id)
        assertThat(resolve(cookie = "missing-session", token = null)).isEqualTo(MemberSessionResolution(true, null))
    }

    @Test
    fun `expires cookies only for invalid provided or required missing sessions`() {
        resolver.ensureUsable(MemberSessionResolution(false, null))
        assertThrows<AppException> { resolver.ensureUsable(MemberSessionResolution(true, null)) }
        assertThrows<AppException> { resolver.ensureUsable(MemberSessionResolution(false, null), requireSession = true) }

        verify(authCookieService, times(2)).expireAuthCookies()
    }

    @Test
    fun `context uses persisted session policy and otherwise retains token fallback policy`() {
        val persisted = resolver.context(MemberSessionResolution(true, snapshot("persisted")), false, false, "fallback")
        val fallback = resolver.context(MemberSessionResolution(false, null), true, true, "fallback")

        assertThat(persisted.rememberLoginEnabled).isTrue()
        assertThat(persisted.ipSecurityEnabled).isTrue()
        assertThat(persisted.ipSecurityFingerprint).isEqualTo("persisted-fingerprint")
        assertThat(fallback.rememberLoginEnabled).isTrue()
        assertThat(fallback.ipSecurityEnabled).isTrue()
        assertThat(fallback.ipSecurityFingerprint).isEqualTo("fallback")
        verify(authCookieService, never()).expireAuthCookies()
    }

    private fun resolve(
        cookie: String,
        token: String?,
    ) = resolver.resolve(
        memberId = 7L,
        cookieSessionKey = cookie,
        tokenSessionKey = token,
        payload = AccessTokenPayload(id = 7L, name = "admin"),
        request = MockHttpServletRequest(),
    )

    private fun activeSession(key: String) =
        MemberSession(
            id = if (key == "cookie-session") 1L else 2L,
            member = mock(Member::class.java),
            sessionKey = key,
            rememberLoginEnabled = true,
            ipSecurityEnabled = true,
            ipSecurityFingerprint = "persisted-fingerprint",
            lastAuthenticatedAt = Instant.parse("2026-09-01T00:00:00Z"),
        )

    private fun snapshot(key: String) =
        com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot(
            id = 9L,
            memberId = 7L,
            sessionKey = key,
            rememberLoginEnabled = true,
            ipSecurityEnabled = true,
            ipSecurityFingerprint = "persisted-fingerprint",
            lastAuthenticatedAt = Instant.parse("2026-09-01T00:00:00Z"),
        )
}
