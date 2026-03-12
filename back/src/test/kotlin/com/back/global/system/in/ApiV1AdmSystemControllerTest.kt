package com.back.global.system.`in`

import com.back.boundedContexts.member.application.service.MemberApplicationService
import jakarta.servlet.http.Cookie
import org.hamcrest.Matchers.anyOf
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional

@ActiveProfiles("test")
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ApiV1AdmSystemControllerTest {
    @Autowired
    private lateinit var mvc: MockMvc

    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Test
    fun `관리자 apiKey 쿠키로 시스템 헬스 상태를 조회할 수 있다`() {
        val admin = memberFacade.findByUsername("admin")!!

        mvc
            .get("/system/api/v1/adm/health") {
                cookie(Cookie("apiKey", admin.apiKey))
            }.andExpect {
                status { isOk() }
                jsonPath("$.status") { value("UP") }
            }
    }

    @Test
    @WithUserDetails("admin")
    fun `관리자는 시스템 헬스 상태를 조회할 수 있다`() {
        mvc.get("/system/api/v1/adm/health").andExpect {
            status { isOk() }
            jsonPath("$.status") { value("UP") }
            jsonPath("$.serverTime") { isString() }
            jsonPath("$.uptimeMs") { isNumber() }
            jsonPath("$.version") { isString() }
            jsonPath("$.checks.db") { value("UP") }
            jsonPath("$.checks.redis") { value(anyOf(equalTo("UP"), equalTo("SKIPPED"))) }
            jsonPath("$.checks.signupMail") { value(anyOf(equalTo("TEST_MODE"), equalTo("READY"), equalTo("MISCONFIGURED"))) }
        }
    }

    @Test
    @WithUserDetails("admin")
    fun `관리자는 회원가입 메일 진단 상태를 조회할 수 있다`() {
        mvc.get("/system/api/v1/adm/mail/signup").andExpect {
            status { isOk() }
            jsonPath("$.status") { value(anyOf(equalTo("TEST_MODE"), equalTo("READY"), equalTo("MISCONFIGURED"))) }
            jsonPath("$.adapter") { isString() }
            jsonPath("$.verifyPath") { value("/signup/verify") }
        }
    }

    @Test
    @WithUserDetails("admin")
    fun `관리자는 회원가입 테스트 메일 발송을 요청할 수 있다`() {
        mvc
            .post("/system/api/v1/adm/mail/signup/test") {
                contentType = org.springframework.http.MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "email": "tester@example.com"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isAccepted() }
                jsonPath("$.resultCode") { value("202-3") }
                jsonPath("$.data.email") { value("tester@example.com") }
            }
    }

    @Test
    @WithUserDetails("user1")
    fun `일반 사용자는 시스템 헬스 상태를 조회할 수 없다`() {
        mvc.get("/system/api/v1/adm/health").andExpect {
            status { isForbidden() }
            jsonPath("$.resultCode") { value("403-1") }
            jsonPath("$.msg") { value("권한이 없습니다.") }
        }
    }

    @Test
    fun `비로그인 사용자는 시스템 헬스 상태를 조회할 수 없다`() {
        mvc.get("/system/api/v1/adm/health").andExpect {
            status { isUnauthorized() }
            jsonPath("$.resultCode") { value("401-1") }
            jsonPath("$.msg") { value("로그인 후 이용해주세요.") }
        }
    }
}
