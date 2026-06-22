package com.back.boundedContexts.member.subContexts.legalAcceptance.application.port.input

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.dto.LegalAcceptanceCommand
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.dto.LegalReconsentReport
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.dto.LegalReconsentStatus
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.service.ActiveLegalDocumentMetadata
import com.back.boundedContexts.member.subContexts.legalAcceptance.model.MemberLegalAcceptance
import java.time.Instant

interface LegalAcceptanceUseCase {
    fun currentDocuments(): ActiveLegalDocumentMetadata

    fun validateStoredSignupPolicyVersion(legalPolicyVersion: String?)

    fun validateEmailSignupAcceptance(command: LegalAcceptanceCommand)

    fun legalReconsentStatus(memberId: Long): LegalReconsentStatus

    fun legalReconsentReport(): LegalReconsentReport

    fun recordEmailSignupAcceptance(
        member: Member,
        command: LegalAcceptanceCommand,
        acceptedAt: Instant,
    ): MemberLegalAcceptance

    fun recordSocialSignupAcceptance(
        member: Member,
        command: LegalAcceptanceCommand,
        acceptedAt: Instant,
        source: String,
    ): MemberLegalAcceptance

    fun recordLegalReconsent(
        member: Member,
        command: LegalAcceptanceCommand,
        acceptedAt: Instant,
        clientIp: String?,
        userAgent: String?,
    ): MemberLegalAcceptance
}
