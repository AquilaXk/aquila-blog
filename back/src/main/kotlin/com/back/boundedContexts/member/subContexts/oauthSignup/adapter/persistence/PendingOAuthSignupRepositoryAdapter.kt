package com.back.boundedContexts.member.subContexts.oauthSignup.adapter.persistence

import com.back.boundedContexts.member.subContexts.oauthSignup.application.port.output.PendingOAuthSignupRepositoryPort
import com.back.boundedContexts.member.subContexts.oauthSignup.domain.PendingOAuthSignup
import org.springframework.stereotype.Component

@Component
class PendingOAuthSignupRepositoryAdapter(
    private val pendingOAuthSignupRepository: PendingOAuthSignupRepository,
) : PendingOAuthSignupRepositoryPort {
    override fun save(pendingOAuthSignup: PendingOAuthSignup): PendingOAuthSignup = pendingOAuthSignupRepository.save(pendingOAuthSignup)

    override fun findByProviderAndProviderSubjectHash(
        provider: String,
        providerSubjectHash: String,
    ): PendingOAuthSignup? =
        pendingOAuthSignupRepository.findByProviderAndProviderSubjectHash(
            provider = provider,
            providerSubjectHash = providerSubjectHash,
        )

    override fun findByPendingTokenHash(pendingTokenHash: String): PendingOAuthSignup? =
        pendingOAuthSignupRepository.findByPendingTokenHash(pendingTokenHash)
}
