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
    var member: Member? = null,
    @field:Column(name = "account_deletion_id")
    var accountDeletionId: Long? = null,
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
    var identityStatus: MemberPrivacyRequestIdentityStatus = MemberPrivacyRequestIdentityStatus.VERIFIED_SESSION,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 32)
    var requesterRole: MemberPrivacyRequestRequesterRole = MemberPrivacyRequestRequesterRole.SUBJECT,
    @field:Column(length = 320)
    val requesterContact: String? = null,
    @field:Column
    val assignedOwnerId: Long? = null,
    @field:Column
    var identityVerifiedById: Long? = null,
    @field:Column
    var identityVerifiedAt: Instant? = null,
    @field:Column
    var stepUpVerifiedById: Long? = null,
    @field:Column
    var stepUpVerifiedAt: Instant? = null,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 32)
    var holdStatus: MemberPrivacyRequestHoldStatus = MemberPrivacyRequestHoldStatus.UNREVIEWED,
    @field:Column(length = 64)
    var holdScope: String? = null,
    @field:Column(length = 1000)
    var holdReason: String? = null,
    @field:Column
    var holdReviewedById: Long? = null,
    @field:Column
    var holdReviewedAt: Instant? = null,
    @field:Column
    var holdReleasedAt: Instant? = null,
    @field:Column(length = 1000)
    var holdReleaseDecision: String? = null,
    @field:Column(length = 1000)
    val message: String? = null,
    @field:Column(nullable = false)
    val requestedAt: Instant,
    @field:Column(nullable = false)
    val dueAt: Instant,
    var completedAt: Instant? = null,
) : BaseTime(id) {
    fun approveManualIdentity(
        member: Member?,
        accountDeletionId: Long?,
        requesterRole: MemberPrivacyRequestRequesterRole,
        verifierId: Long,
        verifiedAt: Instant,
    ) {
        require(identityStatus == MemberPrivacyRequestIdentityStatus.IDENTITY_PENDING)
        require(status == MemberPrivacyRequestStatus.RECEIVED)
        require((member == null) != (accountDeletionId == null))
        this.member = member
        this.accountDeletionId = accountDeletionId
        this.requesterRole = requesterRole
        identityStatus = MemberPrivacyRequestIdentityStatus.VERIFIED_MANUAL
        identityVerifiedById = verifierId
        identityVerifiedAt = verifiedAt
        status = MemberPrivacyRequestStatus.IN_PROGRESS
    }

    fun rejectIdentity(at: Instant) {
        require(identityStatus == MemberPrivacyRequestIdentityStatus.IDENTITY_PENDING)
        require(status == MemberPrivacyRequestStatus.RECEIVED)
        member = null
        accountDeletionId = null
        identityStatus = MemberPrivacyRequestIdentityStatus.REJECTED
        status = MemberPrivacyRequestStatus.REJECTED
        completedAt = at
    }

    fun recordStepUp(
        verifierId: Long,
        at: Instant,
        approved: Boolean,
    ) {
        require(identityStatus.isVerified())
        require(!status.isClosed())
        stepUpVerifiedById = if (approved) verifierId else null
        stepUpVerifiedAt = if (approved) at else null
    }

    fun decideHold(
        status: MemberPrivacyRequestHoldStatus,
        scope: String?,
        reason: String?,
        reviewerId: Long,
        at: Instant,
        releaseDecision: String?,
    ) {
        require(identityStatus.isVerified())
        require(!this.status.isClosed())
        when (status) {
            MemberPrivacyRequestHoldStatus.ACTIVE -> {
                require(!scope.isNullOrBlank() && !reason.isNullOrBlank())
                holdScope = scope.trim()
                holdReason = reason.trim()
                holdReviewedById = reviewerId
                holdReviewedAt = at
                holdReleaseDecision = null
                holdReleasedAt = null
            }
            MemberPrivacyRequestHoldStatus.CLEARED -> {
                holdScope = null
                holdReason = null
                holdReviewedById = reviewerId
                holdReviewedAt = at
                holdReleaseDecision = null
                holdReleasedAt = null
            }
            MemberPrivacyRequestHoldStatus.RELEASED -> {
                require(holdStatus == MemberPrivacyRequestHoldStatus.ACTIVE)
                require(!releaseDecision.isNullOrBlank())
                holdReleaseDecision = releaseDecision.trim()
                holdReleasedAt = at
            }
            MemberPrivacyRequestHoldStatus.UNREVIEWED ->
                throw IllegalArgumentException("UNREVIEWED is not an operator decision")
        }
        holdStatus = status
    }

    fun decide(
        status: MemberPrivacyRequestStatus,
        at: Instant,
    ) {
        require(identityStatus.isVerified())
        require(!this.status.isClosed())
        require(status == MemberPrivacyRequestStatus.COMPLETED || status == MemberPrivacyRequestStatus.REJECTED)
        this.status = status
        completedAt = at
    }

    fun linkDeletionTombstone(accountDeletionId: Long) {
        require(identityStatus.isVerified())
        require(member != null)
        require(this.accountDeletionId == null)
        member = null
        this.accountDeletionId = accountDeletionId
    }

    private fun MemberPrivacyRequestIdentityStatus.isVerified(): Boolean =
        this == MemberPrivacyRequestIdentityStatus.VERIFIED_SESSION ||
            this == MemberPrivacyRequestIdentityStatus.VERIFIED_MANUAL

    private fun MemberPrivacyRequestStatus.isClosed(): Boolean =
        this == MemberPrivacyRequestStatus.COMPLETED || this == MemberPrivacyRequestStatus.REJECTED
}

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
