package com.back.boundedContexts.member.subContexts.signupVerification.adapter.web

import com.back.boundedContexts.member.subContexts.legalAcceptance.application.service.ActiveLegalDocumentMetadata
import com.back.boundedContexts.member.subContexts.signupVerification.adapter.persistence.MemberSignupVerificationRepository
import com.back.support.BaseSignupDisabledControllerIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.post

@DisplayName("ApiV1SignupVerificationController feature freeze 테스트")
class ApiV1SignupVerificationFeatureFreezeTest : BaseSignupDisabledControllerIntegrationTest() {
    private val legalPolicyVersion = ActiveLegalDocumentMetadata.current().signupPolicyVersion

    @Autowired
    private lateinit var memberSignupVerificationRepository: MemberSignupVerificationRepository

    @Test
    fun `email signup flag가 꺼져 있으면 인증 시작 전에 차단한다`() {
        mvc
            .post("/member/api/v1/signup/email/start") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "email": "freeze@example.com",
                        "termsAccepted": true,
                        "privacyAccepted": true,
                        "legalPolicyVersion": "$legalPolicyVersion"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isServiceUnavailable() }
            }

        assertThat(memberSignupVerificationRepository.findTopByEmailOrderByCreatedAtDesc("freeze@example.com"))
            .isNull()
    }

    @Test
    fun `email signup flag가 꺼져 있으면 토큰 검증과 세션 쿠키 발급도 차단한다`() {
        val response =
            mvc
                .post("/member/api/v1/signup/email/verify") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"token": "freeze-token"}"""
                }.andExpect {
                    status { isServiceUnavailable() }
                }.andReturn()
                .response

        assertThat(response.getHeader("Set-Cookie")).isNull()
    }
}
