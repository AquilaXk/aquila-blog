package com.back.boundedContexts.member.subContexts.legalAcceptance.adapter.persistence

import com.back.boundedContexts.member.subContexts.legalAcceptance.application.port.output.MemberLegalAcceptanceRepositoryPort
import com.back.boundedContexts.member.subContexts.legalAcceptance.model.MemberLegalAcceptance
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface MemberLegalAcceptanceRepository :
    JpaRepository<MemberLegalAcceptance, Long>,
    MemberLegalAcceptanceRepositoryPort {
    override fun findTopByMemberIdOrderByAcceptedAtDesc(memberId: Long): MemberLegalAcceptance?

    @Query(
        """
        select count(distinct acceptance.member.id)
        from MemberLegalAcceptance acceptance
        where acceptance.termsVersion = :termsVersion
          and acceptance.termsContentSha256 = :termsContentSha256
          and acceptance.privacyVersion = :privacyVersion
          and acceptance.privacyContentSha256 = :privacyContentSha256
        """,
    )
    override fun countMembersWithCurrentAcceptance(
        @Param("termsVersion") termsVersion: String,
        @Param("termsContentSha256") termsContentSha256: String,
        @Param("privacyVersion") privacyVersion: String,
        @Param("privacyContentSha256") privacyContentSha256: String,
    ): Long

    @Query(
        """
        select count(member)
        from Member member
        where not exists (
            select acceptance.id
            from MemberLegalAcceptance acceptance
            where acceptance.member = member
              and acceptance.termsVersion = :termsVersion
              and acceptance.termsContentSha256 = :termsContentSha256
              and acceptance.privacyVersion = :privacyVersion
              and acceptance.privacyContentSha256 = :privacyContentSha256
        )
        """,
    )
    override fun countMembersMissingCurrentAcceptance(
        @Param("termsVersion") termsVersion: String,
        @Param("termsContentSha256") termsContentSha256: String,
        @Param("privacyVersion") privacyVersion: String,
        @Param("privacyContentSha256") privacyContentSha256: String,
    ): Long
}
