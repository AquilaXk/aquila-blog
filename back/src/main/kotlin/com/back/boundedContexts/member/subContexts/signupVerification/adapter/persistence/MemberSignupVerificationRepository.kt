package com.back.boundedContexts.member.subContexts.signupVerification.adapter.persistence

import com.back.boundedContexts.member.subContexts.signupVerification.domain.MemberSignupVerification
import org.springframework.data.jpa.repository.JpaRepository

interface MemberSignupVerificationRepository : JpaRepository<MemberSignupVerification, Long> {
    fun findByEmailVerificationTokenHash(emailVerificationTokenHash: String): MemberSignupVerification?

    fun findBySignupSessionTokenHash(signupSessionTokenHash: String): MemberSignupVerification?

    fun findTopByEmailOrderByCreatedAtDesc(email: String): MemberSignupVerification?
}
