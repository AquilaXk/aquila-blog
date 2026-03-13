package com.back.boundedContexts.member.subContexts.signupVerification.adapter.`in`.task

import com.back.boundedContexts.member.subContexts.signupVerification.application.port.out.SignupVerificationMailSenderPort
import com.back.boundedContexts.member.subContexts.signupVerification.dto.SendSignupVerificationMailPayload
import com.back.global.task.annotation.TaskHandler
import org.springframework.stereotype.Component

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
