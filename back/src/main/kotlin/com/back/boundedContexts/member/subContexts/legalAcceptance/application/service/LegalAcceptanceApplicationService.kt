package com.back.boundedContexts.member.subContexts.legalAcceptance.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.dto.LegalAcceptanceCommand
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.dto.LegalReconsentReport
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.dto.LegalReconsentStatus
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.port.input.LegalAcceptanceUseCase
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.port.output.MemberLegalAcceptanceRepositoryPort
import com.back.boundedContexts.member.subContexts.legalAcceptance.model.MemberLegalAcceptance
import com.back.global.exception.application.AppException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.MessageDigest
import java.time.Instant

@Service
class LegalAcceptanceApplicationService(
    private val memberLegalAcceptanceRepository: MemberLegalAcceptanceRepositoryPort,
) : LegalAcceptanceUseCase {
    override fun currentDocuments(): ActiveLegalDocumentMetadata = ActiveLegalDocumentMetadata.current()

    override fun validateStoredSignupPolicyVersion(legalPolicyVersion: String?) {
        val storedVersion = legalPolicyVersion?.trim().orEmpty()
        val active = currentDocuments()

        if (storedVersion != active.signupPolicyVersion) {
            throw AppException("409-4", "약관 또는 개인정보처리방침이 변경되었습니다. 최신 내용을 확인하고 다시 동의해주세요.")
        }
    }

    override fun validateEmailSignupAcceptance(command: LegalAcceptanceCommand) {
        if (!command.age14OrOlder) {
            throw AppException("400-2", "만 14세 이상인 경우에만 회원가입할 수 있습니다.")
        }
        if (!command.requiredPrivacyConfirmed) {
            throw AppException("400-2", "개인정보 처리 필수 안내를 확인해야 회원가입할 수 있습니다.")
        }
        if (!command.overseasTransferAcknowledged) {
            throw AppException("400-2", "국외 이전 및 외부 처리자 안내를 확인해야 회원가입할 수 있습니다.")
        }

        val active = currentDocuments()
        val matchesActiveDocuments =
            command.termsVersion.trim() == active.terms.version &&
                command.termsContentSha256.trim().lowercase() == active.terms.contentSha256 &&
                command.privacyVersion.trim() == active.privacy.version &&
                command.privacyContentSha256.trim().lowercase() == active.privacy.contentSha256

        if (!matchesActiveDocuments) {
            throw AppException("409-4", "약관 또는 개인정보처리방침이 변경되었습니다. 최신 내용을 확인하고 다시 동의해주세요.")
        }
    }

    override fun legalReconsentStatus(memberId: Long): LegalReconsentStatus {
        val active = currentDocuments()
        val latest = memberLegalAcceptanceRepository.findTopByMemberIdOrderByAcceptedAtDesc(memberId)
        val current =
            latest != null &&
                latest.termsVersion == active.terms.version &&
                latest.termsContentSha256 == active.terms.contentSha256 &&
                latest.privacyVersion == active.privacy.version &&
                latest.privacyContentSha256 == active.privacy.contentSha256

        return LegalReconsentStatus(
            status = if (current) "CURRENT" else "RECONSENT_REQUIRED",
            required = !current,
            termsVersion = active.terms.version,
            termsContentSha256 = active.terms.contentSha256,
            privacyVersion = active.privacy.version,
            privacyContentSha256 = active.privacy.contentSha256,
            acceptedAt = latest?.acceptedAt?.takeIf { current },
        )
    }

    override fun legalReconsentReport(): LegalReconsentReport {
        val active = currentDocuments()
        return LegalReconsentReport(
            currentAcceptedMembers =
                memberLegalAcceptanceRepository.countMembersWithCurrentAcceptance(
                    termsVersion = active.terms.version,
                    termsContentSha256 = active.terms.contentSha256,
                    privacyVersion = active.privacy.version,
                    privacyContentSha256 = active.privacy.contentSha256,
                ),
            reconsentRequiredMembers =
                memberLegalAcceptanceRepository.countMembersMissingCurrentAcceptance(
                    termsVersion = active.terms.version,
                    termsContentSha256 = active.terms.contentSha256,
                    privacyVersion = active.privacy.version,
                    privacyContentSha256 = active.privacy.contentSha256,
                ),
        )
    }

    @Transactional
    override fun recordEmailSignupAcceptance(
        member: Member,
        command: LegalAcceptanceCommand,
        acceptedAt: Instant,
    ): MemberLegalAcceptance =
        recordSignupAcceptance(
            member = member,
            command = command,
            acceptedAt = acceptedAt,
            source = "EMAIL_SIGNUP",
        )

    @Transactional
    override fun recordSocialSignupAcceptance(
        member: Member,
        command: LegalAcceptanceCommand,
        acceptedAt: Instant,
        source: String,
    ): MemberLegalAcceptance =
        recordSignupAcceptance(
            member = member,
            command = command,
            acceptedAt = acceptedAt,
            source = source,
        )

    @Transactional
    override fun recordLegalReconsent(
        member: Member,
        command: LegalAcceptanceCommand,
        acceptedAt: Instant,
        clientIp: String?,
        userAgent: String?,
    ): MemberLegalAcceptance =
        recordSignupAcceptance(
            member = member,
            command = command,
            acceptedAt = acceptedAt,
            source = "RECONSENT",
            clientIpHash = sha256OrNull(clientIp),
            userAgentHash = sha256OrNull(userAgent),
        )

    private fun recordSignupAcceptance(
        member: Member,
        command: LegalAcceptanceCommand,
        acceptedAt: Instant,
        source: String,
        clientIpHash: String? = null,
        userAgentHash: String? = null,
    ): MemberLegalAcceptance {
        validateEmailSignupAcceptance(command)

        return memberLegalAcceptanceRepository.save(
            MemberLegalAcceptance(
                member = member,
                termsVersion = command.termsVersion.trim(),
                termsContentSha256 = command.termsContentSha256.trim().lowercase(),
                privacyVersion = command.privacyVersion.trim(),
                privacyContentSha256 = command.privacyContentSha256.trim().lowercase(),
                age14OrOlder = command.age14OrOlder,
                requiredPrivacyConfirmed = command.requiredPrivacyConfirmed,
                analyticsConsent = command.analyticsConsent,
                overseasTransferAcknowledged = command.overseasTransferAcknowledged,
                source = source.trim().take(32),
                clientIpHash = clientIpHash,
                userAgentHash = userAgentHash,
                acceptedAt = acceptedAt,
            ),
        )
    }

    private fun sha256OrNull(value: String?): String? {
        val normalized = value?.trim().orEmpty()
        if (normalized.isBlank()) return null

        return MessageDigest
            .getInstance("SHA-256")
            .digest(normalized.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }
}
