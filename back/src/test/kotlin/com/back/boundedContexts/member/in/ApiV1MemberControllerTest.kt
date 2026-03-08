package com.back.boundedContexts.member.`in`

import com.back.boundedContexts.member.app.MemberFacade
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler
import org.springframework.transaction.annotation.Transactional

@ActiveProfiles("test")
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ApiV1MemberControllerTest {
    @Autowired
    private lateinit var mvc: MockMvc

    @Autowired
    private lateinit var memberFacade: MemberFacade

    @Nested
    inner class RedirectToProfileImg {
        @Nested
        inner class Success {
            @Test
            fun `프로필 이미지 리다이렉트 요청이 성공하면 Location 헤더와 함께 302를 반환한다`() {
                val member = memberFacade.findByUsername("user1")!!

                mvc.get("/member/api/v1/members/${member.id}/redirectToProfileImg")
                    .andExpect {
                        status { isFound() }
                        match(handler().handlerType(ApiV1MemberController::class.java))
                        match(handler().methodName("redirectToProfileImg"))
                        header { exists(HttpHeaders.LOCATION) }
                        header { string(HttpHeaders.LOCATION, member.profileImgUrlOrDefault) }
                    }
            }
        }

        @Nested
        inner class Failure {
            @Test
            fun `프로필 이미지 리다이렉트 요청에서 없는 회원 id 를 보내면 404를 반환한다`() {
                mvc.get("/member/api/v1/members/999999/redirectToProfileImg")
                    .andExpect {
                        status { isNotFound() }
                        match(handler().handlerType(ApiV1MemberController::class.java))
                        match(handler().methodName("redirectToProfileImg"))
                        jsonPath("$.resultCode") { value("404-1") }
                        jsonPath("$.msg") { value("해당 데이터가 존재하지 않습니다.") }
                    }
            }
        }
    }

    @Nested
    inner class RandomSecureTip {
        @Nested
        inner class Success {
            @Test
            @WithUserDetails("user1")
            fun `랜덤 보안 팁 조회는 보안 안내 문구를 반환한다`() {
                mvc.get("/member/api/v1/members/randomSecureTip")
                    .andExpect {
                        status { isOk() }
                        match(handler().handlerType(ApiV1MemberController::class.java))
                        match(handler().methodName("randomSecureTip"))
                        header { string(HttpHeaders.CONTENT_TYPE, startsWith(MediaType.TEXT_PLAIN_VALUE)) }
                        content {
                            string("비밀번호는 영문, 숫자, 특수문자를 조합하여 8자 이상으로 설정하세요.")
                        }
                    }
            }
        }

        @Nested
        inner class Failure {
            @Test
            fun `랜덤 보안 팁 조회에서 미인증 사용자는 401을 반환한다`() {
                mvc.get("/member/api/v1/members/randomSecureTip")
                    .andExpect {
                        status { isUnauthorized() }
                        jsonPath("$.resultCode") { value("401-1") }
                        jsonPath("$.msg") { value("로그인 후 이용해주세요.") }
                    }
            }
        }
    }

    @Nested
    inner class Join {
        @Nested
        inner class Success {
            @Test
            fun `회원 가입 요청이 성공하면 회원이 생성되고 생성된 회원 정보를 반환한다`() {
                val resultActions = mvc.post("/member/api/v1/members") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "username": "usernew",
                            "password": "1234",
                            "nickname": "무명"
                        }
                        """.trimIndent()
                }

                val member = memberFacade.findByUsername("usernew")!!

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
                    jsonPath("$.data.profileImageUrl") { value(member.redirectToProfileImgUrlOrDefault) }
                }
            }
        }

        @Nested
        inner class Failure {
            @Test
            fun `회원 가입 요청에서 이미 존재하는 username 을 보내면 409를 반환한다`() {
                mvc.post("/member/api/v1/members") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "username": "user1",
                            "password": "1234",
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
                mvc.post("/member/api/v1/members") {
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
