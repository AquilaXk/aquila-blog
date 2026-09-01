package com.back.boundedContexts.member.subContexts.privacy.model

import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType.SEQUENCE
import jakarta.persistence.Id
import jakarta.persistence.SequenceGenerator
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint
import java.time.Instant
import java.util.UUID

@Entity
@Table(
    uniqueConstraints = [
        UniqueConstraint(name = "uk_member_privacy_request_audit_operation", columnNames = ["operation_id"]),
    ],
)
class MemberPrivacyRequestAudit(
    @field:Id
    @field:SequenceGenerator(
        name = "member_privacy_request_audit_seq_gen",
        sequenceName = "member_privacy_request_audit_seq",
        allocationSize = 20,
    )
    @field:GeneratedValue(strategy = SEQUENCE, generator = "member_privacy_request_audit_seq_gen")
    override val id: Long = 0,
    @field:Column(name = "request_id", nullable = false)
    val requestId: Long,
    @field:Column(name = "operation_id", nullable = false, updatable = false)
    val operationId: UUID,
    @field:Column(name = "actor_member_id", nullable = false, updatable = false)
    val actorMemberId: Long,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 48, updatable = false)
    val action: MemberPrivacyRequestAuditAction,
    @field:Column(nullable = false, updatable = false)
    val occurredAt: Instant,
    @field:Column(length = 1000, updatable = false)
    val decision: String? = null,
    @field:Column(nullable = false, updatable = false)
    val redactedRecordCount: Long = 0,
    @field:Column(length = 64, updatable = false)
    val evidenceSha256: String? = null,
) : BaseTime(id)

enum class MemberPrivacyRequestAuditAction {
    IDENTITY_REVIEWED,
    STEP_UP_VERIFIED,
    HOLD_REVIEWED,
    HOLD_RELEASED,
    REQUEST_REJECTED,
}
