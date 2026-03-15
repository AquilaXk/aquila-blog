package com.back.boundedContexts.member.subContexts.signupVerification.application.port.output

import java.time.Instant

interface SignupVerificationMailSenderPort {
    fun send(
        toEmail: String,
        verificationLink: String,
        expiresAt: Instant,
    )
}
