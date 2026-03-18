package com.back.boundedContexts.member.subContexts.signupVerification.adapter.scheduler

import com.back.boundedContexts.member.subContexts.signupVerification.application.port.output.SignupVerificationMailSenderPort
import com.back.boundedContexts.member.subContexts.signupVerification.dto.SendSignupVerificationMailPayload
import com.back.global.task.annotation.TaskHandler
import org.springframework.stereotype.Component

/**
 * SignupVerificationMailTaskHandler의 책임을 정의하는 클래스입니다.
 * 해당 도메인 흐름에서 역할 분리를 위해 분리된 구성요소입니다.
 */
@Component
class SignupVerificationMailTaskHandler(
    private val signupVerificationMailSender: SignupVerificationMailSenderPort,
) {
    @TaskHandler
    fun handle(payload: SendSignupVerificationMailPayload) {
        signupVerificationMailSender.send(
            toEmail = payload.toEmail,
            verificationLink = payload.verificationLink,
            expiresAt = payload.expiresAt,
        )
    }
}
