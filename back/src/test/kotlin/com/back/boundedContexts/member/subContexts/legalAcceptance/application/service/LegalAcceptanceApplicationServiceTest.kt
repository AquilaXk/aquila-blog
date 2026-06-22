package com.back.boundedContexts.member.subContexts.legalAcceptance.application.service

import com.back.boundedContexts.member.adapter.web.ApiV1AdmMemberController
import com.back.boundedContexts.member.dto.AuthSessionMemberDto
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.dto.LegalReconsentReport
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.port.output.MemberLegalAcceptanceRepositoryPort
import com.back.boundedContexts.member.subContexts.legalAcceptance.model.MemberLegalAcceptance
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

class LegalAcceptanceApplicationServiceTest {
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
        assertThat(AuthSessionMemberDto(id = 1, isAdmin = false, username = "user", nickname = "nick").legalReconsent)
            .isNull()
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
