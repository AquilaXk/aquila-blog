package com.back.boundedContexts.member.subContexts.oauthSignup.application.service

import com.back.boundedContexts.member.subContexts.oauthSignup.application.port.input.OAuthSignupUseCase
import com.back.boundedContexts.member.subContexts.oauthSignup.application.port.output.PendingOAuthSignupRepositoryPort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class OAuthSignupApplicationService(
    private val pendingOAuthSignupRepository: PendingOAuthSignupRepositoryPort,
    private val oauthSignupHashService: OAuthSignupHashService,
) : OAuthSignupUseCase {
    override fun providerSubjectHash(
        provider: String,
        providerSubject: String,
    ): String = oauthSignupHashService.providerSubjectHash(provider, providerSubject)

    override fun memberLoginId(
        provider: String,
        providerSubjectHash: String,
    ): String = oauthSignupHashService.memberLoginId(provider, providerSubjectHash)

    @Transactional
    override fun releaseConsumedSignupForMemberLoginId(memberLoginId: String): Int =
        pendingOAuthSignupRepository.deleteByMemberLoginId(memberLoginId)
}
