package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.service.LoginAttemptService
import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.member.subContexts.session.adapter.persistence.MemberSessionRepository
import com.back.global.security.config.AuthCookieNames
import com.back.support.BaseControllerIntegrationTest
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.RequestPostProcessor

class AuthSessionSecurityContractTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Autowired
    private lateinit var loginAttemptService: LoginAttemptService

    @Autowired
    private lateinit var memberSessionRepository: MemberSessionRepository

    @AfterEach
    fun clearLoginAttemptState() {
        loginAttemptService.clearAllForTest()
    }

    @Test
    fun `relogin keeps the existing api key session usable`() {
        val member = memberFacade.findByEmail(MEMBER_EMAIL)!!
        val firstLogin = login()
        val firstApiKey = requireCookie(firstLogin, AuthCookieNames.API_KEY)

        val secondLogin = login()
        assertThat(requireCookie(secondLogin, AuthCookieNames.API_KEY).value).isEqualTo(firstApiKey.value)

        mvc
            .get(SESSION_PATH) {
                firstLogin.forEach { cookie(it) }
            }.andExpect {
                status { isOk() }
                jsonPath("$.id") { value(member.id) }
                jsonPath("$.nickname") { value(member.nickname) }
            }
    }

    @Test
    fun `valid refresh token rotates credentials for the retained session route`() {
        val member = memberFacade.findByEmail(MEMBER_EMAIL)!!
        val authCookies = login()
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
    fun `reusing a rotated refresh token revokes the retained session`() {
        val authCookies = login()
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
    fun `valid bearer credentials keep the retained session without reissuing tokens`() {
        val member = memberFacade.findByEmail(MEMBER_EMAIL)!!
        val authCookies = login()
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
                }.andReturn()

        assertThat(result.response.getCookie(AuthCookieNames.ACCESS_TOKEN)).isNull()
        assertThat(result.response.getHeader(HttpHeaders.AUTHORIZATION)).isNull()
    }

    @Test
    fun `ip security rejects a changed client ip on the retained session route`() {
        val authCookies = login(ipSecurity = true)

        mvc
            .get(SESSION_PATH) {
                authCookies.forEach { cookie(it) }
                with(remoteAddr("10.0.0.77"))
            }.andExpect {
                status { isUnauthorized() }
                jsonPath("$.resultCode") { value("401-7") }
                AuthCookieNames.AUTHENTICATION_COOKIE_NAMES.forEach { name -> cookie { maxAge(name, 0) } }
            }
    }

    @Test
    fun `ip security trusts the original client ip across proxy address changes`() {
        val member = memberFacade.findByEmail(MEMBER_EMAIL)!!
        val authCookies =
            login(
                ipSecurity = true,
                clientIp = "198.51.100.34",
                proxyIp = "172.18.0.5",
            )

        mvc
            .get(SESSION_PATH) {
                authCookies.forEach { cookie(it) }
                header("CF-Connecting-IP", "198.51.100.34")
                with(remoteAddr("172.18.0.9"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.id") { value(member.id) }
                jsonPath("$.nickname") { value(member.nickname) }
            }
    }

    private fun login(
        ipSecurity: Boolean = false,
        clientIp: String? = null,
        proxyIp: String? = null,
    ): List<Cookie> =
        mvc
            .post("/member/api/v1/auth/login") {
                contentType = MediaType.APPLICATION_JSON
                clientIp?.let { header("CF-Connecting-IP", it) }
                proxyIp?.let { with(remoteAddr(it)) }
                content =
                    """
                    {
                        "email": "$MEMBER_EMAIL",
                        "password": "1234",
                        "ipSecurity": $ipSecurity
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
            }.andReturn()
            .response
            .cookies
            .filter { cookie ->
                cookie.name in AuthCookieNames.AUTHENTICATION_COOKIE_NAMES && cookie.value.isNotBlank()
            }

    private fun requireCookie(
        cookies: List<Cookie>,
        name: String,
    ): Cookie = cookies.firstOrNull { it.name == name } ?: error("$name cookie not issued")

    private fun isIssuedAccessToken(cookie: Cookie): Boolean = cookie.name == AuthCookieNames.ACCESS_TOKEN && cookie.value.isNotBlank()

    private fun isIssuedRefreshToken(cookie: Cookie): Boolean = cookie.name == AuthCookieNames.REFRESH_TOKEN && cookie.value.isNotBlank()

    private fun remoteAddr(ip: String): RequestPostProcessor =
        RequestPostProcessor { request ->
            request.remoteAddr = ip
            request
        }

    private companion object {
        const val MEMBER_EMAIL = "user1@test.com"
        const val SESSION_PATH = "/member/api/v1/auth/session"
    }
}
