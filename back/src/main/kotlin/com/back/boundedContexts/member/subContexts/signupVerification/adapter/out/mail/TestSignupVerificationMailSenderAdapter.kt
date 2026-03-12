package com.back.boundedContexts.member.subContexts.signupVerification.adapter.out.mail

import com.back.boundedContexts.member.subContexts.signupVerification.application.port.out.SignupVerificationMailSenderPort
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.time.Instant

@Profile("test")
@Component
class TestSignupVerificationMailSenderAdapter : SignupVerificationMailSenderPort {
    override fun send(
        toEmail: String,
        verificationLink: String,
        expiresAt: Instant,
    ) {
        // 테스트에서는 실제 메일 발송 대신 서비스 흐름만 검증한다.
    }
}
