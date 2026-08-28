package com.back.boundedContexts.member.subContexts.legalAcceptance.application.service

import com.back.boundedContexts.member.adapter.web.ApiV1AdmMemberController
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.dto.LegalReconsentReport
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.port.output.MemberLegalAcceptanceRepositoryPort
import com.back.boundedContexts.member.subContexts.legalAcceptance.model.MemberLegalAcceptance
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.time.Instant

class LegalAcceptanceApplicationServiceTest {
    @Test
    @DisplayName("privacy export metadata keeps persisted identity and request hashes")
    fun legalAcceptanceKeepsPersistedPrivacyMetadata() {
        val acceptedAt = Instant.parse("2026-08-28T00:00:00Z")
        val member = Member(id = 7L, username = "member", nickname = "Member", apiKey = "member-api-key")
        val termsVersion = "terms-v1"
        val termsContentSha256 = "terms-sha"
        val privacyVersion = "privacy-v1"
        val privacyContentSha256 = "privacy-sha"
        val source = "EXISTING_MEMBER"
        val clientIpHash = "client-ip-hash"
        val userAgentHash = "user-agent-hash"

        val acceptance =
            MemberLegalAcceptance(
                id = 9L,
                member = member,
                termsVersion = termsVersion,
                termsContentSha256 = termsContentSha256,
                privacyVersion = privacyVersion,
                privacyContentSha256 = privacyContentSha256,
                age14OrOlder = true,
                requiredPrivacyConfirmed = true,
                analyticsConsent = false,
                overseasTransferAcknowledged = true,
                source = source,
                clientIpHash = clientIpHash,
                userAgentHash = userAgentHash,
                acceptedAt = acceptedAt,
            )

        assertThat(acceptance)
            .extracting(
                MemberLegalAcceptance::id,
                MemberLegalAcceptance::member,
                MemberLegalAcceptance::termsVersion,
                MemberLegalAcceptance::termsContentSha256,
                MemberLegalAcceptance::privacyVersion,
                MemberLegalAcceptance::privacyContentSha256,
                MemberLegalAcceptance::age14OrOlder,
                MemberLegalAcceptance::requiredPrivacyConfirmed,
                MemberLegalAcceptance::analyticsConsent,
                MemberLegalAcceptance::overseasTransferAcknowledged,
                MemberLegalAcceptance::source,
                MemberLegalAcceptance::clientIpHash,
                MemberLegalAcceptance::userAgentHash,
                MemberLegalAcceptance::acceptedAt,
            ).containsExactly(
                9L,
                member,
                termsVersion,
                termsContentSha256,
                privacyVersion,
                privacyContentSha256,
                true,
                true,
                false,
                true,
                source,
                clientIpHash,
                userAgentHash,
                acceptedAt,
            )
    }

    @Test
    @DisplayName("legal reconsent report uses current policy counts")
    fun legalReconsentReportUsesCurrentPolicyCounts() {
        val repository = CountingLegalAcceptanceRepository(currentAcceptedMembers = 3, reconsentRequiredMembers = 2)
        val report = LegalAcceptanceApplicationService(repository).legalReconsentReport()

        assertThat(report.currentAcceptedMembers).isEqualTo(3)
        assertThat(report.reconsentRequiredMembers).isEqualTo(2)
        assertThat(report.totalMembers).isEqualTo(5)
        assertThat(report.completionRate).isEqualTo(0.6)
        assertThat(repository.lastTermsVersion).isEqualTo(ActiveLegalDocumentMetadata.current().terms.version)
        assertThat(ApiV1AdmMemberController.LegalReconsentReportResponse(report).report).isSameAs(report)
    }

    @Test
    @DisplayName("legal reconsent report is complete when there are no legacy members")
    fun legalReconsentReportIsCompleteWhenThereAreNoLegacyMembers() {
        val report = LegalReconsentReport(currentAcceptedMembers = 0, reconsentRequiredMembers = 0)

        assertThat(report.totalMembers).isEqualTo(0)
        assertThat(report.completionRate).isEqualTo(1.0)
    }

    private class CountingLegalAcceptanceRepository(
        private val currentAcceptedMembers: Long,
        private val reconsentRequiredMembers: Long,
    ) : MemberLegalAcceptanceRepositoryPort {
        var lastTermsVersion: String? = null

        override fun save(memberLegalAcceptance: MemberLegalAcceptance): MemberLegalAcceptance =
            throw UnsupportedOperationException("not used")

        override fun findTopByMemberIdOrderByAcceptedAtDesc(memberId: Long): MemberLegalAcceptance? =
            throw UnsupportedOperationException("not used")

        override fun countMembersWithCurrentAcceptance(
            termsVersion: String,
            termsContentSha256: String,
            privacyVersion: String,
            privacyContentSha256: String,
        ): Long {
            lastTermsVersion = termsVersion
            return currentAcceptedMembers
        }

        override fun countMembersMissingCurrentAcceptance(
            termsVersion: String,
            termsContentSha256: String,
            privacyVersion: String,
            privacyContentSha256: String,
        ): Long = reconsentRequiredMembers
    }
}
