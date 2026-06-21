package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.global.security.config.AuthCookieNames
import com.back.support.BaseControllerIntegrationTest
import com.jayway.jsonpath.JsonPath
import jakarta.servlet.http.Cookie
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

class ApiV1PrivacyRightsControllerTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Test
    fun `개인정보 export 는 로그인 사용자의 계정 스냅샷을 반환한다`() {
        val member =
            memberFacade.join(
                username = "privacy-export-user",
                password = "Abcd1234!",
                nickname = "정보내보내기",
                profileImgUrl = null,
                email = "privacy-export-user@example.com",
            )
        val authCookies = loginAuthCookies(member.email!!)

        mvc
            .get("/member/api/v1/privacy/export") {
                authCookies.forEach { cookie(it) }
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("개인정보 내보내기 데이터를 조회했습니다.") }
                jsonPath("$.data.member.id") { value(member.id) }
                jsonPath("$.data.member.email") { value("privacy-export-user@example.com") }
                jsonPath("$.data.member.username") { value("privacy-export-user") }
                jsonPath("$.data.member.nickname") { value("정보내보내기") }
                jsonPath("$.data.member.createdAt") { value(startsWith(member.createdAt.toString().take(20))) }
                jsonPath("$.data.generatedAt") { value(startsWith("20")) }
            }
    }

    @Test
    fun `개인정보 처리 요청은 생성 후 본인 상태 조회가 가능하다`() {
        val member =
            memberFacade.join(
                username = "privacy-request-user",
                password = "Abcd1234!",
                nickname = "권리요청",
                profileImgUrl = null,
                email = "privacy-request-user@example.com",
            )
        val authCookies = loginAuthCookies(member.email!!)

        val created =
            mvc
                .post("/member/api/v1/privacy/requests") {
                    authCookies.forEach { cookie(it) }
                    header("X-Aquila-CSRF", "1")
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "type": "EXPORT",
                            "message": "가입 정보와 운영 로그 열람을 요청합니다."
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isCreated() }
                    jsonPath("$.resultCode") { value("201-1") }
                    jsonPath("$.msg") { value("개인정보 처리 요청을 접수했습니다.") }
                    jsonPath("$.data.item.id") { isNumber() }
                    jsonPath("$.data.item.type") { value("EXPORT") }
                    jsonPath("$.data.item.status") { value("RECEIVED") }
                    jsonPath("$.data.item.message") { value("가입 정보와 운영 로그 열람을 요청합니다.") }
                    jsonPath("$.data.item.requestedAt") { value(startsWith("20")) }
                    jsonPath("$.data.item.dueAt") { value(startsWith("20")) }
                }.andReturn()

        val requestId = JsonPath.read<Int>(created.response.contentAsString, "$.data.item.id").toLong()

        mvc
            .get("/member/api/v1/privacy/requests/$requestId") {
                authCookies.forEach { cookie(it) }
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("개인정보 처리 요청 상태를 조회했습니다.") }
                jsonPath("$.data.item.id") { value(requestId) }
                jsonPath("$.data.item.memberId") { value(member.id) }
                jsonPath("$.data.item.type") { value("EXPORT") }
                jsonPath("$.data.item.status") { value("RECEIVED") }
            }
    }

    private fun loginAuthCookies(email: String): List<Cookie> =
        mvc
            .post("/member/api/v1/auth/login") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "email": "$email",
                        "password": "Abcd1234!"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
            }.andReturn()
            .response
            .cookies
            .filter {
                it.name in AuthCookieNames.AUTHENTICATION_COOKIE_NAMES &&
                    it.value.isNotBlank()
            }
}
