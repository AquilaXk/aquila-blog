package com.back.boundedContexts.member.subContexts.signupVerification.adapter.scheduler

import com.back.boundedContexts.member.subContexts.signupVerification.adapter.mail.TestSignupVerificationMailSenderAdapter
import com.back.boundedContexts.member.subContexts.signupVerification.application.port.output.SignupVerificationMailSenderPort
import com.back.boundedContexts.member.subContexts.signupVerification.dto.SendSignupVerificationMailPayload
import org.assertj.core.api.Assertions.assertThatCode
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import java.time.Instant
import java.util.UUID

class SignupVerificationMailTaskHandlerTest {
    @Test
    fun `test mail sender는 외부 발송 없이 payload를 소비한다`() {
        assertThatCode {
            TestSignupVerificationMailSenderAdapter().send(
                toEmail = "member@example.test",
                verificationLink = "https://www.example.test/signup/verify",
                expiresAt = Instant.parse("2026-08-11T00:05:00Z"),
            )
        }.doesNotThrowAnyException()
    }

    @Test
    fun `task handler는 exact verification payload를 mail sender에 위임한다`() {
        val sender = mock(SignupVerificationMailSenderPort::class.java)
        val handler = SignupVerificationMailTaskHandler(sender)
        val payload =
            SendSignupVerificationMailPayload(
                uid = UUID.randomUUID(),
                aggregateType = "MemberSignupVerification",
                aggregateId = 41L,
                toEmail = "member@example.test",
                verificationLink = "https://www.example.test/signup/verify",
                expiresAt = Instant.parse("2026-08-11T00:05:00Z"),
            )

        handler.handle(payload)

        verify(sender).send(
            toEmail = payload.toEmail,
            verificationLink = payload.verificationLink,
            expiresAt = payload.expiresAt,
        )
    }
}
