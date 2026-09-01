package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.member.application.service.MemberLoginSessionIssueService
import com.back.boundedContexts.member.subContexts.session.adapter.persistence.MemberSessionRepository
import com.back.global.security.config.AuthCookieNames
import com.back.support.BaseControllerIntegrationTest
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpHeaders
import org.springframework.test.web.servlet.get

class AuthSessionSecurityContractTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Autowired
    private lateinit var loginSessionIssueService: MemberLoginSessionIssueService

    @Autowired
    private lateinit var memberSessionRepository: MemberSessionRepository

    @Test
    fun `valid refresh token rotates credentials for the retained session route`() {
        val member = memberFacade.findByEmail(ADMIN_EMAIL)!!
        val authCookies = issueAdminSession()
        val sessionKey = requireCookie(authCookies, AuthCookieNames.SESSION_KEY)
        val refreshToken = requireCookie(authCookies, AuthCookieNames.REFRESH_TOKEN)

        val result =
            mvc
                .get(SESSION_PATH) {
                    cookie(Cookie(AuthCookieNames.ACCESS_TOKEN, "wrong-access-token"))
                    cookie(refreshToken)
                    cookie(sessionKey)
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.id") { value(member.id) }
                    jsonPath("$.isAdmin") { value(true) }
                }.andReturn()

        val rotatedAccessToken = result.response.cookies.firstOrNull(::isIssuedAccessToken)
        val rotatedRefreshToken = result.response.cookies.firstOrNull(::isIssuedRefreshToken)
        assertThat(rotatedAccessToken).isNotNull
        assertThat(rotatedRefreshToken).isNotNull
        assertThat(rotatedRefreshToken!!.value).isNotEqualTo(refreshToken.value)
        assertThat(result.response.getHeader(HttpHeaders.AUTHORIZATION))
            .isEqualTo("Bearer ${rotatedAccessToken!!.value}")
    }

    @Test
    fun `reusing a rotated refresh token revokes the retained administrator session`() {
        val authCookies = issueAdminSession()
        val sessionKey = requireCookie(authCookies, AuthCookieNames.SESSION_KEY)
        val staleRefreshToken = requireCookie(authCookies, AuthCookieNames.REFRESH_TOKEN)

        mvc
            .get(SESSION_PATH) {
                cookie(Cookie(AuthCookieNames.ACCESS_TOKEN, "wrong-access-token"))
                cookie(staleRefreshToken)
                cookie(sessionKey)
            }.andExpect {
                status { isOk() }
            }

        mvc
            .get(SESSION_PATH) {
                cookie(Cookie(AuthCookieNames.ACCESS_TOKEN, "wrong-access-token"))
                cookie(staleRefreshToken)
                cookie(sessionKey)
            }.andExpect {
                status { isUnauthorized() }
                jsonPath("$.resultCode") { value("401-8") }
                AuthCookieNames.AUTHENTICATION_COOKIE_NAMES.forEach { name -> cookie { maxAge(name, 0) } }
            }

        val revokedSession = memberSessionRepository.findBySessionKey(sessionKey.value)
        assertThat(revokedSession).isNotNull
        assertThat(revokedSession!!.refreshTokenReusedAt).isNotNull
        assertThat(revokedSession.revokedAt).isNotNull
    }

    @Test
    fun `valid bearer credentials retain the administrator session without reissuing tokens`() {
        val member = memberFacade.findByEmail(ADMIN_EMAIL)!!
        val authCookies = issueAdminSession()
        val apiKey = requireCookie(authCookies, AuthCookieNames.API_KEY)
        val accessToken = requireCookie(authCookies, AuthCookieNames.ACCESS_TOKEN)
        val sessionKey = requireCookie(authCookies, AuthCookieNames.SESSION_KEY)

        val result =
            mvc
                .get(SESSION_PATH) {
                    header(HttpHeaders.AUTHORIZATION, "Bearer ${apiKey.value} ${accessToken.value}")
                    cookie(sessionKey)
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.id") { value(member.id) }
                    jsonPath("$.isAdmin") { value(true) }
                }.andReturn()

        assertThat(result.response.getCookie(AuthCookieNames.ACCESS_TOKEN)).isNull()
        assertThat(result.response.getHeader(HttpHeaders.AUTHORIZATION)).isNull()
    }

    private fun issueAdminSession(): List<Cookie> {
        val issued =
            loginSessionIssueService.issueAdminEmail(
                email = ADMIN_EMAIL,
                nickname = "관리자",
                rememberLoginEnabled = false,
                createdIp = "127.0.0.1",
                userAgent = "AuthSessionSecurityContractTest",
            )
        return listOf(
            Cookie(AuthCookieNames.API_KEY, issued.apiKey),
            Cookie(AuthCookieNames.ACCESS_TOKEN, issued.accessToken),
            Cookie(AuthCookieNames.REFRESH_TOKEN, issued.refreshToken),
            Cookie(AuthCookieNames.SESSION_KEY, issued.sessionKey),
        )
    }

    private fun requireCookie(
        cookies: List<Cookie>,
        name: String,
    ): Cookie = cookies.firstOrNull { it.name == name } ?: error("$name cookie not issued")

    private fun isIssuedAccessToken(cookie: Cookie): Boolean = cookie.name == AuthCookieNames.ACCESS_TOKEN && cookie.value.isNotBlank()

    private fun isIssuedRefreshToken(cookie: Cookie): Boolean = cookie.name == AuthCookieNames.REFRESH_TOKEN && cookie.value.isNotBlank()

    private companion object {
        const val ADMIN_EMAIL = "admin@test.com"
        const val SESSION_PATH = "/member/api/v1/auth/session"
    }
}
