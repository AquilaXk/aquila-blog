package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.service.LoginAttemptService
import com.back.global.security.config.AuthCookieNames
import com.back.support.BaseControllerIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

class AdminAuthControllerContractTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var loginAttemptService: LoginAttemptService

    @AfterEach
    fun clearLoginAttemptState() {
        loginAttemptService.clearAllForTest()
    }

    @ParameterizedTest
    @ValueSource(booleans = [false, true])
    fun `canonical admin password login is rejected without issuing cookies`(rememberMe: Boolean) {
        val login =
            mvc
                .post("/member/api/v1/auth/login") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"email":"admin@test.com","password":"1234","rememberMe":$rememberMe}"""
                }.andExpect {
                    status { isUnauthorized() }
                    jsonPath("$.resultCode") { value("401-1") }
                }.andReturn()

        assertThat(login.response.cookies.map { it.name })
            .doesNotContainAnyElementsOf(AuthCookieNames.AUTHENTICATION_COOKIE_NAMES)
    }

    @Test
    fun `ordinary member retains privacy access without admin authority`() {
        val login =
            mvc
                .post("/member/api/v1/auth/login") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"email":"user1@test.com","password":"1234"}"""
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.item.isAdmin") { value(false) }
                }.andReturn()
        val authCookies =
            login.response.cookies.filter { cookie ->
                cookie.name in AuthCookieNames.AUTHENTICATION_COOKIE_NAMES && cookie.value.isNotBlank()
            }

        mvc
            .get("/member/api/v1/privacy/export") {
                authCookies.forEach { cookie(it) }
            }.andExpect {
                status { isOk() }
            }

        mvc
            .get("/member/api/v1/adm/members/bootstrap") {
                authCookies.forEach { cookie(it) }
            }.andExpect {
                status { isForbidden() }
            }
    }
}
