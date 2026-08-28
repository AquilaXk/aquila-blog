package com.back.boundedContexts.member.subContexts.oauthSignup.adapter.persistence

import com.back.boundedContexts.member.subContexts.oauthSignup.application.port.output.PendingOAuthSignupRepositoryPort
import org.springframework.stereotype.Component

@Component
class PendingOAuthSignupRepositoryAdapter(
    private val pendingOAuthSignupRepository: PendingOAuthSignupRepository,
) : PendingOAuthSignupRepositoryPort {
    override fun deleteByMemberLoginId(memberLoginId: String): Int = pendingOAuthSignupRepository.deleteByMemberLoginId(memberLoginId)
}
