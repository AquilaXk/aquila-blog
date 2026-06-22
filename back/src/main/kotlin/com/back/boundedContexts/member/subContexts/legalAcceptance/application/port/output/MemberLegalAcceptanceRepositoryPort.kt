package com.back.boundedContexts.member.subContexts.legalAcceptance.application.port.output

import com.back.boundedContexts.member.subContexts.legalAcceptance.model.MemberLegalAcceptance

interface MemberLegalAcceptanceRepositoryPort {
    fun save(memberLegalAcceptance: MemberLegalAcceptance): MemberLegalAcceptance

    fun findTopByMemberIdOrderByAcceptedAtDesc(memberId: Long): MemberLegalAcceptance?

    fun countMembersWithCurrentAcceptance(
        termsVersion: String,
        termsContentSha256: String,
        privacyVersion: String,
        privacyContentSha256: String,
    ): Long

    fun countMembersMissingCurrentAcceptance(
        termsVersion: String,
        termsContentSha256: String,
        privacyVersion: String,
        privacyContentSha256: String,
    ): Long
}
