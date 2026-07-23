package com.back.boundedContexts.member.subContexts.signupVerification.application.port.output

import com.back.boundedContexts.member.subContexts.signupVerification.domain.MemberSignupVerification
import java.time.Instant

interface MemberSignupVerificationRepositoryPort {
    fun save(memberSignupVerification: MemberSignupVerification): MemberSignupVerification

    fun findByEmailVerificationTokenHash(emailVerificationTokenHash: String): MemberSignupVerification?

    fun findBySignupSessionTokenHash(signupSessionTokenHash: String): MemberSignupVerification?

    fun findTopByEmail(email: String): MemberSignupVerification?

    fun deleteRetainedBefore(
        cutoff: Instant,
        limit: Int,
    ): Int
}
