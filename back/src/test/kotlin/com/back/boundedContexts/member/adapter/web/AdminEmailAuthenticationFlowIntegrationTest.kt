package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.subContexts.session.adapter.persistence.MemberSessionRepository
import com.back.global.security.config.AuthCookieNames
import com.back.support.BaseAdminEmailAuthenticationFlowIntegrationTest
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.mockito.ArgumentMatchers.anyLong
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.doAnswer
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import tools.jackson.databind.ObjectMapper

class AdminEmailAuthenticationFlowIntegrationTest : BaseAdminEmailAuthenticationFlowIntegrationTest() {
    @Test
    fun `email code requests default persistent login to off`() {
        val request = ApiV1AuthController.AdminEmailCodeRequest(email = "admin@test.com")

        assertThat(request.rememberMe).isFalse()
    }

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @Autowired
    private lateinit var memberSessionRepository: MemberSessionRepository

    @ParameterizedTest
    @ValueSource(booleans = [false, true])
    fun `email authentication honors persistence and revokes the canonical admin session`(rememberMe: Boolean) {
        var deliveredCode = ""
        doAnswer { invocation ->
            deliveredCode = invocation.getArgument(1)
            null
        }.`when`(adminLoginMailSender).sendCode(anyString(), anyString(), anyLong())

        val request =
            mvc
                .post("/member/api/v1/auth/admin-email/request") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"email":"admin@test.com","rememberMe":$rememberMe}"""
                }.andExpect {
                    status { isOk() }
                }.andReturn()
        val challengeId = objectMapper.readTree(request.response.contentAsString).at("/data/challengeId").asText()
        assertThat(challengeId).isNotBlank()
        assertThat(deliveredCode).matches("\\d{8}")

        val verified =
            mvc
                .post("/member/api/v1/auth/admin-email/verify") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"challengeId":"$challengeId","code":"$deliveredCode"}"""
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.item.isAdmin") { value(true) }
                }.andReturn()
        val authCookies =
            verified.response.cookies.filter { cookie ->
                cookie.name in AuthCookieNames.AUTHENTICATION_COOKIE_NAMES && cookie.value.isNotBlank()
            }
        assertThat(verified.response.cookies.map { it.name }).doesNotContain("SESSION", "JSESSIONID")
        assertThat(authCookies.map { it.name }).containsExactlyInAnyOrderElementsOf(AuthCookieNames.AUTHENTICATION_COOKIE_NAMES)
        if (rememberMe) {
            assertThat(authCookies).allSatisfy { cookie -> assertThat(cookie.maxAge).isPositive() }
        } else {
            assertThat(authCookies).allSatisfy { cookie -> assertThat(cookie.maxAge).isEqualTo(-1) }
        }

        val sessionKey = requireCookie(authCookies, AuthCookieNames.SESSION_KEY).value
        val activeSession = memberSessionRepository.findBySessionKeyAndRevokedAtIsNull(sessionKey)
        assertThat(activeSession).isNotNull
        assertThat(activeSession!!.rememberLoginEnabled).isEqualTo(rememberMe)

        mvc
            .get("/member/api/v1/auth/session") {
                authCookies.forEach { cookie(it) }
            }.andExpect {
                status { isOk() }
                jsonPath("$.id") { value(activeSession.member.id) }
                jsonPath("$.isAdmin") { value(true) }
                jsonPath("$.nickname") { value("관리자") }
                jsonPath("$.legalReconsent") { doesNotExist() }
            }

        mvc
            .delete("/member/api/v1/auth/logout") {
                authCookies.forEach { cookie(it) }
                header("X-Aquila-CSRF", "1")
            }.andExpect {
                status { isOk() }
                AuthCookieNames.AUTHENTICATION_COOKIE_NAMES.forEach { name -> cookie { maxAge(name, 0) } }
            }

        val revokedSession = memberSessionRepository.findBySessionKey(sessionKey)
        assertThat(revokedSession).isNotNull
        assertThat(revokedSession!!.revokedAt).isNotNull

        mvc
            .get("/member/api/v1/auth/session") {
                authCookies.forEach { cookie(it) }
            }.andExpect {
                status { isUnauthorized() }
                jsonPath("$.resultCode") { value("401-8") }
                AuthCookieNames.AUTHENTICATION_COOKIE_NAMES.forEach { name -> cookie { maxAge(name, 0) } }
            }
    }

    private fun requireCookie(
        cookies: List<Cookie>,
        name: String,
    ): Cookie = cookies.firstOrNull { it.name == name } ?: error("$name cookie not issued")
}
