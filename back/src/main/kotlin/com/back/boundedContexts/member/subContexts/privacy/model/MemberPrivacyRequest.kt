package com.back.boundedContexts.member.subContexts.privacy.model

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.jpa.domain.AfterDDL
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
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS member_privacy_request_idx_status_closed_at_id
    ON member_privacy_request (status, (COALESCE(completed_at, modified_at, requested_at)), id)
    """,
)
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
    @field:JoinColumn(name = "member_id")
    val member: Member? = null,
    @field:Column(name = "account_deletion_id")
    val accountDeletionId: Long? = null,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 48)
    val type: MemberPrivacyRequestType,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 32)
    var status: MemberPrivacyRequestStatus = MemberPrivacyRequestStatus.RECEIVED,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 32)
    val intakeChannel: MemberPrivacyRequestIntakeChannel = MemberPrivacyRequestIntakeChannel.AUTHENTICATED_SESSION,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 32)
    val identityStatus: MemberPrivacyRequestIdentityStatus = MemberPrivacyRequestIdentityStatus.VERIFIED_SESSION,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 32)
    val requesterRole: MemberPrivacyRequestRequesterRole = MemberPrivacyRequestRequesterRole.SUBJECT,
    @field:Column(length = 320)
    val requesterContact: String? = null,
    @field:Column
    val assignedOwnerId: Long? = null,
    @field:Column
    val identityVerifiedById: Long? = null,
    @field:Column
    val identityVerifiedAt: Instant? = null,
    @field:Column
    val stepUpVerifiedById: Long? = null,
    @field:Column
    val stepUpVerifiedAt: Instant? = null,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 32)
    val holdStatus: MemberPrivacyRequestHoldStatus = MemberPrivacyRequestHoldStatus.UNREVIEWED,
    @field:Column(length = 64)
    val holdScope: String? = null,
    @field:Column(length = 1000)
    val holdReason: String? = null,
    @field:Column
    val holdReviewedById: Long? = null,
    @field:Column
    val holdReviewedAt: Instant? = null,
    @field:Column
    val holdReleasedAt: Instant? = null,
    @field:Column(length = 1000)
    val holdReleaseDecision: String? = null,
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

enum class MemberPrivacyRequestIntakeChannel {
    AUTHENTICATED_SESSION,
    EMAIL,
}

enum class MemberPrivacyRequestIdentityStatus {
    VERIFIED_SESSION,
    IDENTITY_PENDING,
    VERIFIED_MANUAL,
    REJECTED,
}

enum class MemberPrivacyRequestRequesterRole {
    SUBJECT,
    AUTHORIZED_REPRESENTATIVE,
}

enum class MemberPrivacyRequestHoldStatus {
    UNREVIEWED,
    CLEARED,
    ACTIVE,
    RELEASED,
}
