package com.back.global.security.config.oauth2

import com.back.boundedContexts.member.application.service.IssuedLoginSession
import com.back.boundedContexts.member.application.service.MemberLoginSessionIssueService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.security.config.oauth2.application.OAuth2State
import com.back.global.security.domain.SecurityUser
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.ClientIpResolver
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority

class CustomOAuth2LoginSuccessHandlerTest {
    private val memberLoginSessionIssueService = mock(MemberLoginSessionIssueService::class.java)
    private val authCookieService = mock(AuthCookieService::class.java)
    private val clientIpResolver = mock(ClientIpResolver::class.java)
    private val handler =
        CustomOAuth2LoginSuccessHandler(
            memberLoginSessionIssueService,
            authCookieService,
            clientIpResolver,
        )

    @Test
    fun `valid OAuth state issues auth cookies and redirects with the committed login session`() {
        val request =
            MockHttpServletRequest("GET", "/login/oauth2/code/kakao").apply {
                setParameter("state", OAuth2State("/editor?draft=1", "state-id").encode())
                addHeader("User-Agent", "oauth-success-handler-test")
            }
        val response = MockHttpServletResponse()
        val issued = issuedLoginSession()
        given(clientIpResolver.resolve(request)).willReturn("203.0.113.10")
        given(
            memberLoginSessionIssueService.issue(
                memberId = 41L,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                createdIp = "203.0.113.10",
                userAgent = "oauth-success-handler-test",
            ),
        ).willReturn(issued)

        handler.onAuthenticationSuccess(request, response, authentication())

        then(memberLoginSessionIssueService)
            .should()
            .issue(41L, true, false, null, "203.0.113.10", "oauth-success-handler-test")
        then(authCookieService)
            .should()
            .issueAuthCookies(
                issued.apiKey,
                issued.accessToken,
                issued.refreshToken,
                issued.sessionKey,
                issued.rememberLoginEnabled,
            )
        assertThat(response.status).isEqualTo(302)
        assertThat(response.redirectedUrl).isEqualTo("/editor?draft=1")
    }

    @Test
    fun `invalid OAuth state is rejected before a login session or cookies are issued`() {
        val request =
            MockHttpServletRequest("GET", "/login/oauth2/code/kakao").apply {
                setParameter("state", "%%%not-base64%%%")
            }
        val response = MockHttpServletResponse()

        assertThatThrownBy {
            handler.onAuthenticationSuccess(request, response, authentication())
        }.isInstanceOf(IllegalArgumentException::class.java)

        verifyNoInteractions(memberLoginSessionIssueService, authCookieService, clientIpResolver)
        assertThat(response.redirectedUrl).isNull()
    }

    @Test
    fun `login session issue failure leaves OAuth response without cookies or redirect`() {
        val request =
            MockHttpServletRequest("GET", "/login/oauth2/code/kakao").apply {
                setParameter("state", OAuth2State("/", "state-id").encode())
            }
        val response = MockHttpServletResponse()
        given(clientIpResolver.resolve(request)).willReturn("203.0.113.10")
        given(
            memberLoginSessionIssueService.issue(41L, true, false, null, "203.0.113.10", null),
        ).willThrow(IllegalStateException("session issue failed"))

        assertThatThrownBy {
            handler.onAuthenticationSuccess(request, response, authentication())
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessage("session issue failed")

        verifyNoInteractions(authCookieService)
        assertThat(response.redirectedUrl).isNull()
    }

    private fun authentication() =
        UsernamePasswordAuthenticationToken(
            SecurityUser(
                id = 41L,
                username = "KAKAO__oauth-user-id",
                password = "",
                nickname = "OAuth User",
                authorities = listOf(SimpleGrantedAuthority("ROLE_MEMBER")),
            ),
            null,
        )

    private fun issuedLoginSession() =
        IssuedLoginSession(
            member = Member(41L, "KAKAO__oauth-user-id", null, "OAuth User", "oauth@example.com"),
            apiKey = "normalized-api-key",
            accessToken = "access-token",
            refreshToken = "refresh-token",
            sessionKey = "session-key",
            rememberLoginEnabled = true,
        )
}
