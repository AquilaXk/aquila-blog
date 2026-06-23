package com.back.boundedContexts.member.subContexts.signupVerification.adapter.persistence

import com.back.boundedContexts.member.subContexts.signupVerification.domain.MemberSignupVerification
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

interface MemberSignupVerificationRepository : JpaRepository<MemberSignupVerification, Long> {
    fun findByEmailVerificationTokenHash(emailVerificationTokenHash: String): MemberSignupVerification?

    fun findBySignupSessionTokenHash(signupSessionTokenHash: String): MemberSignupVerification?

    fun findTopByEmailOrderByCreatedAtDesc(email: String): MemberSignupVerification?

    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Transactional
    @Query(
        value = """
        delete from member_signup_verification
        where id in (
            select id
            from member_signup_verification
            where consumed_at < :cutoff
               or cancelled_at < :cutoff
               or (verified_at is null and email_verification_expires_at < :cutoff)
               or (signup_session_expires_at is not null and signup_session_expires_at < :cutoff)
            order by id asc
            limit :limit
        )
        """,
        nativeQuery = true,
    )
    fun deleteRetainedBefore(
        @Param("cutoff") cutoff: Instant,
        @Param("limit") limit: Int,
    ): Int
}
