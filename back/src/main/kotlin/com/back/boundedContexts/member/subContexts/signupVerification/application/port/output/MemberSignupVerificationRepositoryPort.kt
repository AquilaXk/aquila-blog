package com.back.boundedContexts.member.subContexts.signupVerification.application.port.output

import java.time.Instant

interface MemberSignupVerificationRepositoryPort {
    fun deleteRetainedBefore(
        cutoff: Instant,
        limit: Int,
    ): Int
}
