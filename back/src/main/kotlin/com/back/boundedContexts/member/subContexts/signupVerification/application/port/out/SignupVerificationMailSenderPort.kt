package com.back.boundedContexts.member.subContexts.signupVerification.application.port.out

import java.time.Instant

interface SignupVerificationMailSenderPort {
    fun send(
        toEmail: String,
        verificationLink: String,
        expiresAt: Instant,
    )
}
