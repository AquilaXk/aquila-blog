package com.back.boundedContexts.member.subContexts.privacy.model

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType.SEQUENCE
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.SequenceGenerator
import java.time.Instant

@Entity
class MemberPrivacyRequest(
    @field:Id
    @field:SequenceGenerator(
        name = "member_privacy_request_seq_gen",
        sequenceName = "member_privacy_request_seq",
        allocationSize = 20,
    )
    @field:GeneratedValue(strategy = SEQUENCE, generator = "member_privacy_request_seq_gen")
    override val id: Long = 0,
    @field:ManyToOne(fetch = FetchType.LAZY)
    @field:JoinColumn(name = "member_id", nullable = false)
    val member: Member,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 48)
    val type: MemberPrivacyRequestType,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 32)
    var status: MemberPrivacyRequestStatus = MemberPrivacyRequestStatus.RECEIVED,
    @field:Column(length = 1000)
    val message: String? = null,
    @field:Column(nullable = false)
    val requestedAt: Instant,
    @field:Column(nullable = false)
    val dueAt: Instant,
    var completedAt: Instant? = null,
) : BaseTime(id)

enum class MemberPrivacyRequestType {
    EXPORT,
    CORRECTION,
    DELETION,
    PROCESSING_RESTRICTION,
    CONSENT_WITHDRAWAL,
}

enum class MemberPrivacyRequestStatus {
    RECEIVED,
    IN_PROGRESS,
    COMPLETED,
    REJECTED,
}
