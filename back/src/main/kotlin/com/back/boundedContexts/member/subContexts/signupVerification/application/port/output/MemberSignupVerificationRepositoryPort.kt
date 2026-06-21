package com.back.boundedContexts.member.subContexts.signupVerification.application.port.output

import com.back.boundedContexts.member.subContexts.signupVerification.domain.MemberSignupVerification

interface MemberSignupVerificationRepositoryPort {
    fun save(memberSignupVerification: MemberSignupVerification): MemberSignupVerification

    fun findByEmailVerificationTokenHash(emailVerificationTokenHash: String): MemberSignupVerification?

    fun findBySignupSessionTokenHash(signupSessionTokenHash: String): MemberSignupVerification?

    fun findTopByEmail(email: String): MemberSignupVerification?
}
