package com.back.boundedContexts.member.subContexts.oauthSignup.application.port.output

import com.back.boundedContexts.member.subContexts.oauthSignup.domain.PendingOAuthSignup

interface PendingOAuthSignupRepositoryPort {
    fun save(pendingOAuthSignup: PendingOAuthSignup): PendingOAuthSignup

    fun findByProviderAndProviderSubjectHash(
        provider: String,
        providerSubjectHash: String,
    ): PendingOAuthSignup?

    fun findByPendingTokenHash(pendingTokenHash: String): PendingOAuthSignup?
}
