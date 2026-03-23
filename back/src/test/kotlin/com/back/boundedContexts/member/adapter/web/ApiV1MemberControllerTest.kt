package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.support.SeededSpringBootTestSupport
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler
import org.springframework.transaction.annotation.Transactional

@ActiveProfiles("test")
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@org.junit.jupiter.api.DisplayName("ApiV1MemberController 테스트")
class ApiV1MemberControllerTest : SeededSpringBootTestSupport() {
    @Autowired
    private lateinit var mvc: MockMvc

    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Nested
    inner class Join {
        @Nested
        inner class Success {
            @Test
            fun `회원 가입 요청이 성공하면 회원이 생성되고 생성된 회원 정보를 반환한다`() {
                val resultActions =
                    mvc.post("/member/api/v1/members") {
                        contentType = MediaType.APPLICATION_JSON
                        content =
                            """
                            {
                                "username": "usernew",
                                "password": "Abcd1234!",
                                "nickname": "무명"
                            }
                            """.trimIndent()
                    }

                val member = memberFacade.findByLoginId("usernew")!!

                resultActions.andExpect {
                    status { isCreated() }
                    match(handler().handlerType(ApiV1MemberController::class.java))
                    match(handler().methodName("join"))
                    jsonPath("$.resultCode") { value("201-1") }
                    jsonPath("$.msg") { value("${member.nickname}님 환영합니다. 회원가입이 완료되었습니다.") }
                    jsonPath("$.data.id") { value(member.id) }
                    jsonPath("$.data.createdAt") { value(startsWith(member.createdAt.toString().take(20))) }
                    jsonPath("$.data.modifiedAt") { value(startsWith(member.modifiedAt.toString().take(20))) }
                    jsonPath("$.data.isAdmin") { value(member.isAdmin) }
                    jsonPath("$.data.name") { value(member.name) }
                    jsonPath("$.data.profileImageUrl") { value(startsWith(member.redirectToProfileImgUrlOrDefault)) }
                }
            }
        }

        @Nested
        inner class Failure {
            @Test
            fun `회원 가입 요청에서 이미 존재하는 username 을 보내면 409를 반환한다`() {
                mvc
                    .post("/member/api/v1/members") {
                        contentType = MediaType.APPLICATION_JSON
                        content =
                            """
                            {
                                "username": "user1",
                                "password": "Abcd1234!",
                                "nickname": "중복유저"
                            }
                            """.trimIndent()
                    }.andExpect {
                        status { isConflict() }
                        match(handler().handlerType(ApiV1MemberController::class.java))
                        match(handler().methodName("join"))
                        jsonPath("$.resultCode") { value("409-1") }
                        jsonPath("$.msg") { value("이미 존재하는 회원 아이디입니다.") }
                    }
            }

            @Test
            fun `회원 가입 요청에서 필수값이 비어 있으면 400을 반환한다`() {
                mvc
                    .post("/member/api/v1/members") {
                        contentType = MediaType.APPLICATION_JSON
                        content =
                            """
                            {
                                "username": "",
                                "password": "",
                                "nickname": ""
                            }
                            """.trimIndent()
                    }.andExpect {
                        status { isBadRequest() }
                        match(handler().handlerType(ApiV1MemberController::class.java))
                        match(handler().methodName("join"))
                        jsonPath("$.resultCode") { value("400-1") }
                    }
            }
        }
    }
}
