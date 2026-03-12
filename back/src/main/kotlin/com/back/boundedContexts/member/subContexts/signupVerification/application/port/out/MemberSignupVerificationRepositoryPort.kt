package com.back.boundedContexts.member.subContexts.signupVerification.application.port.out

import com.back.boundedContexts.member.subContexts.signupVerification.domain.MemberSignupVerification

interface MemberSignupVerificationRepositoryPort {
    fun save(memberSignupVerification: MemberSignupVerification): MemberSignupVerification

    fun findByEmailVerificationToken(emailVerificationToken: String): MemberSignupVerification?

    fun findBySignupSessionToken(signupSessionToken: String): MemberSignupVerification?

    fun findTopByEmail(email: String): MemberSignupVerification?
}
