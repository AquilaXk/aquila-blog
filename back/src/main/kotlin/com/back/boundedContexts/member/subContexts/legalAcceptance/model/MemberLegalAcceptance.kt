package com.back.boundedContexts.member.subContexts.legalAcceptance.model

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.ManyToOne
import jakarta.persistence.SequenceGenerator
import java.time.Instant

@Entity
class MemberLegalAcceptance(
    @field:Id
    @field:SequenceGenerator(
        name = "member_legal_acceptance_seq_gen",
        sequenceName = "member_legal_acceptance_seq",
        allocationSize = 20,
    )
    @field:GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "member_legal_acceptance_seq_gen")
    override val id: Long = 0,
    @field:ManyToOne(fetch = FetchType.LAZY)
    val member: Member,
    @field:Column(nullable = false, length = 32)
    val termsVersion: String,
    @field:Column(nullable = false, length = 64)
    val termsContentSha256: String,
    @field:Column(nullable = false, length = 32)
    val privacyVersion: String,
    @field:Column(nullable = false, length = 64)
    val privacyContentSha256: String,
    @field:Column(name = "age14_or_older", nullable = false)
    val age14OrOlder: Boolean,
    @field:Column(nullable = false)
    val requiredPrivacyConfirmed: Boolean,
    @field:Column(nullable = false)
    val analyticsConsent: Boolean,
    @field:Column(nullable = false)
    val overseasTransferAcknowledged: Boolean,
    @field:Column(nullable = false, length = 32)
    val source: String,
    @field:Column(nullable = false)
    val acceptedAt: Instant,
) : BaseTime(id)
