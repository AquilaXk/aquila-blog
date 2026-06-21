package com.back.boundedContexts.member.subContexts.legalAcceptance.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.port.output.MemberLegalAcceptanceRepositoryPort
import com.back.boundedContexts.member.subContexts.legalAcceptance.model.MemberLegalAcceptance
import com.back.global.exception.application.AppException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

data class LegalAcceptanceCommand(
    val termsVersion: String,
    val termsContentSha256: String,
    val privacyVersion: String,
    val privacyContentSha256: String,
    val age14OrOlder: Boolean,
    val requiredPrivacyConfirmed: Boolean,
    val analyticsConsent: Boolean,
    val overseasTransferAcknowledged: Boolean,
)

@Service
class LegalAcceptanceApplicationService(
    private val memberLegalAcceptanceRepository: MemberLegalAcceptanceRepositoryPort,
) {
    fun currentDocuments(): ActiveLegalDocumentMetadata = ActiveLegalDocumentMetadata.current()

    fun validateStoredSignupPolicyVersion(legalPolicyVersion: String?) {
        val storedVersion = legalPolicyVersion?.trim().orEmpty()
        val active = currentDocuments()
        val matchesActiveDocuments =
            storedVersion == active.terms.version &&
                storedVersion == active.privacy.version

        if (!matchesActiveDocuments) {
            throw AppException("409-4", "약관 또는 개인정보처리방침이 변경되었습니다. 최신 내용을 확인하고 다시 동의해주세요.")
        }
    }

    fun validateEmailSignupAcceptance(command: LegalAcceptanceCommand) {
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

    @Transactional
    fun recordEmailSignupAcceptance(
        member: Member,
        command: LegalAcceptanceCommand,
        acceptedAt: Instant,
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
                source = "EMAIL_SIGNUP",
                acceptedAt = acceptedAt,
            ),
        )
    }
}
