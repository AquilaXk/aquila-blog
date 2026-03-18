package com.back.boundedContexts.member.subContexts.signupVerification.adapter.mail

import com.back.boundedContexts.member.subContexts.signupVerification.application.port.output.SignupVerificationMailSenderPort
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.time.Instant

/**
 * TestSignupVerificationMailSenderAdapter의 책임을 정의하는 클래스입니다.
 * 해당 도메인 흐름에서 역할 분리를 위해 분리된 구성요소입니다.
 */
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
