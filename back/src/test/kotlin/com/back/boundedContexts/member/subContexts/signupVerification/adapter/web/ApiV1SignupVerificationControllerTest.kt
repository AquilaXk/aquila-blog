package com.back.boundedContexts.member.subContexts.signupVerification.adapter.web

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.member.subContexts.legalAcceptance.adapter.persistence.MemberLegalAcceptanceRepository
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.service.ActiveLegalDocumentMetadata
import com.back.boundedContexts.member.subContexts.signupVerification.adapter.persistence.MemberSignupVerificationRepository
import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.domain.TaskStatus
import com.back.support.BaseControllerIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler

@org.junit.jupiter.api.DisplayName("ApiV1SignupVerificationController 테스트")
class ApiV1SignupVerificationControllerTest : BaseControllerIntegrationTest() {
    private val activeLegalDocuments = ActiveLegalDocumentMetadata.current()
    private val legalPolicyVersion = activeLegalDocuments.signupPolicyVersion

    @Autowired
    private lateinit var memberApplicationService: MemberApplicationService

    @Autowired
    private lateinit var memberLegalAcceptanceRepository: MemberLegalAcceptanceRepository

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
                            "email": "new-user@example.com",
                            "termsAccepted": true,
                            "privacyAccepted": true,
                            "legalPolicyVersion": "$legalPolicyVersion"
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
            assertThat(verification.termsAcceptedAt).isNotNull()
            assertThat(verification.privacyAcceptedAt).isNotNull()
            assertThat(verification.legalPolicyVersion).isEqualTo(legalPolicyVersion)
            val mailTasks =
                taskRepository.findAll().filter { it.taskType == "member.signupVerification.sendMail" }
            assertThat(mailTasks).hasSize(1)
            assertThat(mailTasks.single().aggregateId).isEqualTo(verification.id)
            assertThat(mailTasks.single().status).isEqualTo(TaskStatus.COMPLETED)
        }

        @Test
        fun `필수 약관과 개인정보처리방침 동의가 없으면 이메일 인증 시작을 막는다`() {
            mvc
                .post("/member/api/v1/signup/email/start") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "email": "missing-consent@example.com",
                            "termsAccepted": true,
                            "privacyAccepted": false,
                            "legalPolicyVersion": "$legalPolicyVersion"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-2") }
                    jsonPath("$.msg") { value("회원가입을 진행하려면 이용약관과 개인정보처리방침에 모두 동의해야 합니다.") }
                }

            val verification =
                memberSignupVerificationRepository.findTopByEmailOrderByCreatedAtDesc("missing-consent@example.com")

            assertThat(verification).isNull()
            val mailTasks =
                taskRepository.findAll().filter { it.taskType == "member.signupVerification.sendMail" }
            assertThat(mailTasks).isEmpty()
        }

        @Test
        fun `약관 동의 버전이 비어 있으면 이메일 인증 시작을 막는다`() {
            mvc
                .post("/member/api/v1/signup/email/start") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "email": "missing-policy-version@example.com",
                            "termsAccepted": true,
                            "privacyAccepted": true,
                            "legalPolicyVersion": ""
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-2") }
                    jsonPath("$.msg") { value("약관 동의 버전이 올바르지 않습니다.") }
                }

            val verification =
                memberSignupVerificationRepository
                    .findTopByEmailOrderByCreatedAtDesc("missing-policy-version@example.com")

            assertThat(verification).isNull()
            val mailTasks =
                taskRepository.findAll().filter { it.taskType == "member.signupVerification.sendMail" }
            assertThat(mailTasks).isEmpty()
        }

        @Test
        fun `이미 사용 중인 이메일이면 충돌 응답을 반환한다`() {
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
                            "email": "dup@example.com",
                            "termsAccepted": true,
                            "privacyAccepted": true,
                            "legalPolicyVersion": "$legalPolicyVersion"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isConflict() }
                    jsonPath("$.resultCode") { value("409-2") }
                    jsonPath("$.msg") { value("이미 가입된 이메일입니다.") }
                }

            val mailTasks =
                taskRepository.findAll().filter { it.taskType == "member.signupVerification.sendMail" }
            assertThat(mailTasks).isEmpty()
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
                        "email": "$email",
                        "termsAccepted": true,
                        "privacyAccepted": true,
                        "legalPolicyVersion": "$legalPolicyVersion"
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
                            "nickname": "이메일인증회원",
                            "termsVersion": "${activeLegalDocuments.terms.version}",
                            "termsContentSha256": "${activeLegalDocuments.terms.contentSha256}",
                            "privacyVersion": "${activeLegalDocuments.privacy.version}",
                            "privacyContentSha256": "${activeLegalDocuments.privacy.contentSha256}",
                            "age14OrOlder": true,
                            "requiredPrivacyConfirmed": true,
                            "analyticsConsent": false,
                            "overseasTransferAcknowledged": true
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
            val acceptance = memberLegalAcceptanceRepository.findTopByMemberIdOrderByAcceptedAtDesc(joinedMember.id)
            checkNotNull(acceptance)
            assertThat(acceptance.termsVersion).isEqualTo(activeLegalDocuments.terms.version)
            assertThat(acceptance.termsContentSha256).isEqualTo(activeLegalDocuments.terms.contentSha256)
            assertThat(acceptance.privacyVersion).isEqualTo(activeLegalDocuments.privacy.version)
            assertThat(acceptance.privacyContentSha256).isEqualTo(activeLegalDocuments.privacy.contentSha256)
            assertThat(acceptance.age14OrOlder).isTrue()
            assertThat(acceptance.requiredPrivacyConfirmed).isTrue()
            assertThat(acceptance.analyticsConsent).isFalse()
            assertThat(acceptance.overseasTransferAcknowledged).isTrue()
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
                            "nickname": "이메일인증회원",
                            "termsVersion": "${activeLegalDocuments.terms.version}",
                            "termsContentSha256": "${activeLegalDocuments.terms.contentSha256}",
                            "privacyVersion": "${activeLegalDocuments.privacy.version}",
                            "privacyContentSha256": "${activeLegalDocuments.privacy.contentSha256}",
                            "age14OrOlder": true,
                            "requiredPrivacyConfirmed": true,
                            "analyticsConsent": false,
                            "overseasTransferAcknowledged": true
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isNotFound() }
                    jsonPath("$.resultCode") { value("404-2") }
                }
        }

        @Test
        fun `동의 기록이 없는 기존 signup session이면 최종 가입을 막는다`() {
            val email = "legacy-without-consent@example.com"

            mvc.post("/member/api/v1/signup/email/start") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "email": "$email",
                        "termsAccepted": true,
                        "privacyAccepted": true,
                        "legalPolicyVersion": "$legalPolicyVersion"
                    }
                    """.trimIndent()
            }

            val verification =
                memberSignupVerificationRepository.findTopByEmailOrderByCreatedAtDesc(email)
                    ?: error("verification row not created")
            verification.termsAcceptedAt = null
            verification.privacyAcceptedAt = null
            verification.legalPolicyVersion = null
            memberSignupVerificationRepository.save(verification)

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
                            "password": "Abcd1234!",
                            "nickname": "동의누락회원",
                            "termsVersion": "${activeLegalDocuments.terms.version}",
                            "termsContentSha256": "${activeLegalDocuments.terms.contentSha256}",
                            "privacyVersion": "${activeLegalDocuments.privacy.version}",
                            "privacyContentSha256": "${activeLegalDocuments.privacy.contentSha256}",
                            "age14OrOlder": true,
                            "requiredPrivacyConfirmed": true,
                            "analyticsConsent": false,
                            "overseasTransferAcknowledged": true
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-2") }
                    jsonPath("$.msg") { value("회원가입을 진행하려면 이용약관과 개인정보처리방침에 다시 동의해야 합니다.") }
                }

            assertThat(memberApplicationService.findByEmail(email)).isNull()
        }

        @Test
        fun `signup complete 요청에 username 필드를 보내면 검증 오류를 반환한다`() {
            val email = "legacy-signup@example.com"

            mvc.post("/member/api/v1/signup/email/start") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "email": "$email",
                        "termsAccepted": true,
                        "privacyAccepted": true,
                        "legalPolicyVersion": "$legalPolicyVersion"
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
                            "nickname": "레거시회원",
                            "termsVersion": "${activeLegalDocuments.terms.version}",
                            "termsContentSha256": "${activeLegalDocuments.terms.contentSha256}",
                            "privacyVersion": "${activeLegalDocuments.privacy.version}",
                            "privacyContentSha256": "${activeLegalDocuments.privacy.contentSha256}",
                            "age14OrOlder": true,
                            "requiredPrivacyConfirmed": true,
                            "analyticsConsent": false,
                            "overseasTransferAcknowledged": true
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isBadRequest() }
                }
        }

        @Test
        fun `만 14세 이상 확인이 없으면 최종 가입을 막고 member를 생성하지 않는다`() {
            val email = "under-age-direct@example.com"
            val signupToken = issueSignupToken(email)

            mvc
                .post("/member/api/v1/signup/complete") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "signupToken": "$signupToken",
                            "password": "Abcd1234!",
                            "nickname": "연령미확인회원",
                            "termsVersion": "${activeLegalDocuments.terms.version}",
                            "termsContentSha256": "${activeLegalDocuments.terms.contentSha256}",
                            "privacyVersion": "${activeLegalDocuments.privacy.version}",
                            "privacyContentSha256": "${activeLegalDocuments.privacy.contentSha256}",
                            "age14OrOlder": false,
                            "requiredPrivacyConfirmed": true,
                            "analyticsConsent": false,
                            "overseasTransferAcknowledged": true
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-2") }
                    jsonPath("$.msg") { value("만 14세 이상인 경우에만 회원가입할 수 있습니다.") }
                }

            assertThat(memberApplicationService.findByEmail(email)).isNull()
        }

        @Test
        fun `정책 hash가 최신 active 문서와 다르면 최종 가입을 409로 막는다`() {
            val email = "stale-policy@example.com"
            val signupToken = issueSignupToken(email)

            mvc
                .post("/member/api/v1/signup/complete") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "signupToken": "$signupToken",
                            "password": "Abcd1234!",
                            "nickname": "오래된정책회원",
                            "termsVersion": "${activeLegalDocuments.terms.version}",
                            "termsContentSha256": "0000000000000000000000000000000000000000000000000000000000000000",
                            "privacyVersion": "${activeLegalDocuments.privacy.version}",
                            "privacyContentSha256": "${activeLegalDocuments.privacy.contentSha256}",
                            "age14OrOlder": true,
                            "requiredPrivacyConfirmed": true,
                            "analyticsConsent": false,
                            "overseasTransferAcknowledged": true
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isConflict() }
                    jsonPath("$.resultCode") { value("409-4") }
                    jsonPath("$.msg") { value("약관 또는 개인정보처리방침이 변경되었습니다. 최신 내용을 확인하고 다시 동의해주세요.") }
                }

            assertThat(memberApplicationService.findByEmail(email)).isNull()
        }

        @Test
        fun `가입 시작에 저장된 정책 버전이 최신 active 문서와 다르면 최종 가입을 409로 막는다`() {
            val email = "stale-start-policy@example.com"
            val signupToken = issueSignupToken(email, legalPolicyVersion = "2026-01-01")

            mvc
                .post("/member/api/v1/signup/complete") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "signupToken": "$signupToken",
                            "password": "Abcd1234!",
                            "nickname": "오래된시작정책회원",
                            "termsVersion": "${activeLegalDocuments.terms.version}",
                            "termsContentSha256": "${activeLegalDocuments.terms.contentSha256}",
                            "privacyVersion": "${activeLegalDocuments.privacy.version}",
                            "privacyContentSha256": "${activeLegalDocuments.privacy.contentSha256}",
                            "age14OrOlder": true,
                            "requiredPrivacyConfirmed": true,
                            "analyticsConsent": false,
                            "overseasTransferAcknowledged": true
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isConflict() }
                    jsonPath("$.resultCode") { value("409-4") }
                    jsonPath("$.msg") { value("약관 또는 개인정보처리방침이 변경되었습니다. 최신 내용을 확인하고 다시 동의해주세요.") }
                }

            assertThat(memberApplicationService.findByEmail(email)).isNull()
        }

        private fun issueSignupToken(
            email: String,
            legalPolicyVersion: String = this@ApiV1SignupVerificationControllerTest.legalPolicyVersion,
        ): String {
            mvc.post("/member/api/v1/signup/email/start") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "email": "$email",
                        "termsAccepted": true,
                        "privacyAccepted": true,
                        "legalPolicyVersion": "$legalPolicyVersion"
                    }
                    """.trimIndent()
            }

            val verification =
                memberSignupVerificationRepository.findTopByEmailOrderByCreatedAtDesc(email)
                    ?: error("verification row not created")

            mvc.get("/member/api/v1/signup/email/verify") {
                param("token", verification.emailVerificationToken)
            }

            return memberSignupVerificationRepository
                .findTopByEmailOrderByCreatedAtDesc(email)
                ?.signupSessionToken
                ?: error("signup token not issued")
        }
    }
}
