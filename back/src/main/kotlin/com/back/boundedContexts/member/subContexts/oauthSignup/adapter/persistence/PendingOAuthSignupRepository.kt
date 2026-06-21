package com.back.boundedContexts.member.subContexts.oauthSignup.adapter.persistence

import com.back.boundedContexts.member.subContexts.oauthSignup.model.PendingOAuthSignup
import org.springframework.data.jpa.repository.JpaRepository

interface PendingOAuthSignupRepository : JpaRepository<PendingOAuthSignup, Long> {
    fun findByProviderAndProviderSubjectHash(
        provider: String,
        providerSubjectHash: String,
    ): PendingOAuthSignup?

    fun findByPendingTokenHash(pendingTokenHash: String): PendingOAuthSignup?
}
