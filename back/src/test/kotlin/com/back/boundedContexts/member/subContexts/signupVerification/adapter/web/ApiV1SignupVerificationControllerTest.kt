package com.back.boundedContexts.member.subContexts.signupVerification.adapter.web

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.member.subContexts.signupVerification.adapter.persistence.MemberSignupVerificationRepository
import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.domain.TaskStatus
import com.back.support.SeededSpringBootTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
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
@org.junit.jupiter.api.DisplayName("ApiV1SignupVerificationController 테스트")
class ApiV1SignupVerificationControllerTest : SeededSpringBootTestSupport() {
    @Autowired
    private lateinit var mvc: MockMvc

    @Autowired
    private lateinit var memberApplicationService: MemberApplicationService

    @Autowired
    private lateinit var memberSignupVerificationRepository: MemberSignupVerificationRepository

    @Autowired
    private lateinit var taskRepository: TaskRepository

    @Nested
    inner class EmailStart {
        @Test
        fun `이메일 인증 시작 요청이 성공하면 verification row가 생성된다`() {
            mvc
                .post("/member/api/v1/signup/email/start") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "email": "new-user@example.com"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isAccepted() }
                    match(handler().handlerType(ApiV1SignupVerificationController::class.java))
                    match(handler().methodName("start"))
                    jsonPath("$.resultCode") { value("202-1") }
                    jsonPath("$.data.email") { value("new-user@example.com") }
                }

            val verification =
                memberSignupVerificationRepository.findTopByEmailOrderByCreatedAtDesc("new-user@example.com")

            checkNotNull(verification)
            assertThat(verification.emailVerificationToken).isNotBlank()
            val mailTasks =
                taskRepository.findAll().filter { it.taskType == "member.signupVerification.sendMail" }
            assertThat(mailTasks).hasSize(1)
            assertThat(mailTasks.single().aggregateId).isEqualTo(verification.id)
            assertThat(mailTasks.single().status).isEqualTo(TaskStatus.COMPLETED)
        }

        @Test
        fun `이미 사용 중인 이메일이어도 동일한 성공 응답을 반환한다`() {
            memberApplicationService.join(
                username = "dup-email-user",
                password = "Abcd1234!",
                nickname = "중복메일",
                profileImgUrl = null,
                email = "dup@example.com",
            )

            mvc
                .post("/member/api/v1/signup/email/start") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "email": "dup@example.com"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isAccepted() }
                    jsonPath("$.resultCode") { value("202-1") }
                    jsonPath("$.data.email") { value("dup@example.com") }
                }
        }
    }

    @Nested
    inner class EmailVerifyAndComplete {
        @Test
        fun `이메일 인증 후 최종 가입을 완료할 수 있다`() {
            val email = "verify-user@example.com"

            mvc.post("/member/api/v1/signup/email/start") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "email": "$email"
                    }
                    """.trimIndent()
            }

            val verification =
                memberSignupVerificationRepository.findTopByEmailOrderByCreatedAtDesc(email)
                    ?: error("verification row not created")

            mvc
                .get("/member/api/v1/signup/email/verify") {
                    param("token", verification.emailVerificationToken)
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1SignupVerificationController::class.java))
                    match(handler().methodName("verify"))
                    jsonPath("$.resultCode") { value("200-2") }
                    jsonPath("$.data.email") { value(email) }
                    jsonPath("$.data.signupToken") { value(startsWith("")) }
                }

            val refreshed =
                memberSignupVerificationRepository.findTopByEmailOrderByCreatedAtDesc(email)
                    ?: error("verification row missing after verify")

            val signupToken = refreshed.signupSessionToken ?: error("signup token not issued")

            mvc
                .post("/member/api/v1/signup/complete") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "signupToken": "$signupToken",
                            "password": "Abcd1234!",
                            "nickname": "이메일인증회원"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isCreated() }
                    match(handler().handlerType(ApiV1SignupVerificationController::class.java))
                    match(handler().methodName("complete"))
                    jsonPath("$.resultCode") { value("201-2") }
                    jsonPath("$.data.name") { value("이메일인증회원") }
                }

            val joinedMember = memberApplicationService.findByEmail(email)
            checkNotNull(joinedMember)
            assertThat(joinedMember.email).isEqualTo(email)
        }

        @Test
        fun `유효하지 않은 signup token이면 최종 가입을 막는다`() {
            mvc
                .post("/member/api/v1/signup/complete") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "signupToken": "invalid-token",
                            "password": "Abcd1234!",
                            "nickname": "이메일인증회원"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isNotFound() }
                    jsonPath("$.resultCode") { value("404-2") }
                }
        }

        @Test
        fun `signup complete 요청에 username 필드를 보내면 검증 오류를 반환한다`() {
            val email = "legacy-signup@example.com"

            mvc.post("/member/api/v1/signup/email/start") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "email": "$email"
                    }
                    """.trimIndent()
            }

            val verification =
                memberSignupVerificationRepository.findTopByEmailOrderByCreatedAtDesc(email)
                    ?: error("verification row not created")

            mvc.get("/member/api/v1/signup/email/verify") {
                param("token", verification.emailVerificationToken)
            }

            val signupToken =
                memberSignupVerificationRepository
                    .findTopByEmailOrderByCreatedAtDesc(email)
                    ?.signupSessionToken
                    ?: error("signup token not issued")

            mvc
                .post("/member/api/v1/signup/complete") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "signupToken": "$signupToken",
                            "username": "legacy-signup-user",
                            "password": "Abcd1234!",
                            "nickname": "레거시회원"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isBadRequest() }
                }
        }
    }
}
