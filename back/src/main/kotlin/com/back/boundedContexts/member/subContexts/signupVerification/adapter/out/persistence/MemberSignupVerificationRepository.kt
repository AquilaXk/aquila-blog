package com.back.boundedContexts.member.subContexts.signupVerification.adapter.out.persistence

import com.back.boundedContexts.member.subContexts.signupVerification.domain.MemberSignupVerification
import org.springframework.data.jpa.repository.JpaRepository

interface MemberSignupVerificationRepository : JpaRepository<MemberSignupVerification, Int> {
    fun findByEmailVerificationToken(emailVerificationToken: String): MemberSignupVerification?

    fun findBySignupSessionToken(signupSessionToken: String): MemberSignupVerification?

    fun findTopByEmailOrderByCreatedAtDesc(email: String): MemberSignupVerification?
}
