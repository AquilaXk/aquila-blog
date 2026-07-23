package com.back.boundedContexts.member.subContexts.oauthSignup.adapter.persistence

import com.back.boundedContexts.member.subContexts.oauthSignup.model.PendingOAuthSignup
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query

interface PendingOAuthSignupRepository : JpaRepository<PendingOAuthSignup, Long> {
    fun findByProviderAndProviderSubjectHash(
        provider: String,
        providerSubjectHash: String,
    ): PendingOAuthSignup?

    fun findByPendingTokenHash(pendingTokenHash: String): PendingOAuthSignup?

    @Modifying(flushAutomatically = true)
    @Query(
        """
        delete from PendingOAuthSignup p
        where p.memberLoginId = :memberLoginId
          and p.consumedAt is not null
        """,
    )
    fun deleteByMemberLoginId(memberLoginId: String): Int
}
