package com.back.boundedContexts.member.subContexts.legalAcceptance.application.service

import com.back.boundedContexts.member.subContexts.legalAcceptance.application.dto.LegalReconsentReport
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.port.input.LegalAcceptanceUseCase
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.port.output.MemberLegalAcceptanceRepositoryPort
import org.springframework.stereotype.Service

@Service
class LegalAcceptanceApplicationService(
    private val memberLegalAcceptanceRepository: MemberLegalAcceptanceRepositoryPort,
) : LegalAcceptanceUseCase {
    override fun legalReconsentReport(): LegalReconsentReport {
        val active = ActiveLegalDocumentMetadata.current()
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
}
