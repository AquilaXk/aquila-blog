package com.back.boundedContexts.member.subContexts.oauthSignup.application.service

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.service.LegalAcceptanceApplicationService
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.service.LegalAcceptanceCommand
import com.back.boundedContexts.member.subContexts.oauthSignup.application.port.input.OAuthSignupUseCase
import com.back.boundedContexts.member.subContexts.oauthSignup.application.port.output.PendingOAuthSignupRepositoryPort
import com.back.boundedContexts.member.subContexts.oauthSignup.model.PendingOAuthSignup
import com.back.global.exception.application.AppException
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.Locale
import java.util.UUID

@Service
class OAuthSignupApplicationService(
    private val memberUseCase: MemberUseCase,
    private val legalAcceptanceApplicationService: LegalAcceptanceApplicationService,
    private val pendingOAuthSignupRepository: PendingOAuthSignupRepositoryPort,
    private val oauthSignupHashService: OAuthSignupHashService,
    @param:Value("\${custom.member.oauthSignup.pendingExpirationSeconds:1800}")
    private val pendingExpirationSeconds: Long,
) : OAuthSignupUseCase {
    @Transactional(readOnly = true)
    override fun providerSubjectHash(
        provider: String,
        providerSubject: String,
    ): String = oauthSignupHashService.providerSubjectHash(provider, providerSubject)

    @Transactional(readOnly = true)
    override fun memberLoginId(
        provider: String,
        providerSubjectHash: String,
    ): String = oauthSignupHashService.memberLoginId(provider, providerSubjectHash)

    @Transactional
    override fun startPending(
        provider: String,
        providerSubject: String,
        nickname: String,
        profileImgUrl: String?,
    ): OAuthSignupPendingStartResult {
        val normalizedProvider = normalizeProvider(provider)
        val providerSubjectHash = oauthSignupHashService.providerSubjectHash(normalizedProvider, providerSubject)
        val memberLoginId = oauthSignupHashService.memberLoginId(normalizedProvider, providerSubjectHash)

        if (memberUseCase.findByLoginId(memberLoginId) != null) {
            throw AppException("409-4", "이미 연결된 소셜 계정입니다. 로그인 화면에서 다시 시도해주세요.")
        }

        val now = Instant.now()
        val pendingToken = UUID.randomUUID().toString()
        val pendingTokenHash = oauthSignupHashService.pendingTokenHash(pendingToken)
        val expiresAt = now.plusSeconds(pendingExpirationSeconds.coerceAtLeast(60))
        val normalizedNickname = normalizeNickname(nickname)

        val pending =
            pendingOAuthSignupRepository
                .findByProviderAndProviderSubjectHash(
                    provider = normalizedProvider,
                    providerSubjectHash = providerSubjectHash,
                )?.also {
                    if (it.consumedAt != null) {
                        throw AppException("409-4", "이미 처리된 소셜 회원가입입니다. 로그인 화면에서 다시 시도해주세요.")
                    }
                    it.refresh(
                        pendingTokenHash = pendingTokenHash,
                        expiresAt = expiresAt,
                        nickname = normalizedNickname,
                        profileImgUrl = profileImgUrl,
                    )
                }
                ?: PendingOAuthSignup(
                    provider = normalizedProvider,
                    providerSubjectHash = providerSubjectHash,
                    memberLoginId = memberLoginId,
                    pendingTokenHash = pendingTokenHash,
                    pendingTokenExpiresAt = expiresAt,
                    nickname = normalizedNickname,
                    profileImgUrl = profileImgUrl,
                )

        pendingOAuthSignupRepository.save(pending)

        return OAuthSignupPendingStartResult(
            provider = normalizedProvider,
            pendingToken = pendingToken,
            expiresAt = expiresAt,
        )
    }

    @Transactional(readOnly = true)
    override fun findPending(pendingToken: String): OAuthSignupPendingDetails {
        val pending = findPendingOrThrow(pendingToken)
        pending.ensureReadable(Instant.now())

        return OAuthSignupPendingDetails(
            provider = pending.provider,
            nickname = pending.nickname,
            profileImgUrl = pending.profileImgUrl,
            expiresAt = pending.pendingTokenExpiresAt,
        )
    }

    @Transactional
    override fun completeSignup(
        pendingToken: String,
        nickname: String?,
        legalAcceptance: LegalAcceptanceCommand,
    ): Member {
        val pending = findPendingOrThrow(pendingToken)
        val now = Instant.now()
        pending.ensureReadable(now)

        legalAcceptanceApplicationService.validateEmailSignupAcceptance(legalAcceptance)
        if (memberUseCase.findByLoginId(pending.memberLoginId) != null) {
            pending.cancel(now)
            throw AppException("409-4", "이미 연결된 소셜 계정입니다. 로그인 화면에서 다시 시도해주세요.")
        }

        val member =
            memberUseCase.join(
                username = pending.memberLoginId,
                password = null,
                nickname = normalizeNickname(nickname ?: pending.nickname),
                profileImgUrl = pending.profileImgUrl,
                email = null,
            )

        legalAcceptanceApplicationService.recordSocialSignupAcceptance(
            member = member,
            command = legalAcceptance,
            acceptedAt = now,
            source = "${pending.provider}_OAUTH_SIGNUP",
        )
        pending.consume(now)

        return member
    }

    private fun findPendingOrThrow(pendingToken: String): PendingOAuthSignup {
        val normalizedToken =
            pendingToken
                .trim()
                .ifBlank { throw AppException("400-2", "소셜 회원가입 세션이 올바르지 않습니다.") }

        return pendingOAuthSignupRepository.findByPendingTokenHash(
            oauthSignupHashService.pendingTokenHash(normalizedToken),
        ) ?: throw AppException("404-2", "유효하지 않은 소셜 회원가입 세션입니다.")
    }

    private fun normalizeProvider(provider: String): String =
        provider
            .trim()
            .uppercase(Locale.ROOT)
            .ifBlank { throw AppException("400-2", "소셜 로그인 제공자가 올바르지 않습니다.") }

    private fun normalizeNickname(nickname: String): String {
        val normalized = nickname.trim().ifBlank { "카카오사용자" }
        if (normalized.length !in 2..30) {
            throw AppException("400-2", "프로필 이름은 2~30자로 입력해주세요.")
        }
        return normalized
    }
}
