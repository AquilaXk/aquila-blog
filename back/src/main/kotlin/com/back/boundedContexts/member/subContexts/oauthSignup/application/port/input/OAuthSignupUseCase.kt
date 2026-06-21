package com.back.boundedContexts.member.subContexts.oauthSignup.application.port.input

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.service.LegalAcceptanceCommand
import java.time.Instant

data class OAuthSignupPendingStartResult(
    val provider: String,
    val pendingToken: String,
    val expiresAt: Instant,
)

data class OAuthSignupPendingDetails(
    val provider: String,
    val nickname: String,
    val profileImgUrl: String?,
    val expiresAt: Instant,
)

interface OAuthSignupUseCase {
    fun providerSubjectHash(
        provider: String,
        providerSubject: String,
    ): String

    fun memberLoginId(
        provider: String,
        providerSubjectHash: String,
    ): String

    fun startPending(
        provider: String,
        providerSubject: String,
        nickname: String,
        profileImgUrl: String?,
    ): OAuthSignupPendingStartResult

    fun findPending(pendingToken: String): OAuthSignupPendingDetails

    fun completeSignup(
        pendingToken: String,
        nickname: String?,
        legalAcceptance: LegalAcceptanceCommand,
    ): Member
}
