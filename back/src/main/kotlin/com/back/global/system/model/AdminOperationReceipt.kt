package com.back.global.system.model

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
import java.util.UUID

enum class AdminOperationStatus {
    ACCEPTED,
    SUCCEEDED,
    PARTIAL,
    FAILED,
}

enum class AdminOperationAction {
    TASK_DLQ_REPLAY,
}

enum class AdminOperationResultCode {
    NO_MATCHING_TASKS,
    ALL_TASKS_QUARANTINED,
    TASKS_REPLAYED,
    TASKS_PARTIALLY_REPLAYED,
}

@Entity
@Table(name = "admin_operation_receipt")
class AdminOperationReceipt(
    @field:Id
    @field:SequenceGenerator(name = "admin_operation_receipt_seq_gen", sequenceName = "admin_operation_receipt_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "admin_operation_receipt_seq_gen")
    override val id: Long = 0,
    @field:Column(unique = true, nullable = false)
    val operationId: UUID,
    @Column(nullable = false)
    val actorId: Long,
    @Column
    val sessionRowId: Long? = null,
    @Column(nullable = false, length = 64)
    val fingerprint: String,
    @Column(nullable = false, length = 80)
    @Enumerated(EnumType.STRING)
    val action: AdminOperationAction,
    @Column(nullable = false, length = 120)
    val taskType: String,
    @Column(nullable = false)
    val requestedLimit: Int,
    @Column(nullable = false)
    val resetRetryCount: Boolean,
    @Column(nullable = false, length = 200)
    val reason: String,
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    var status: AdminOperationStatus = AdminOperationStatus.ACCEPTED,
    var selectedCount: Int = 0,
    var replayedCount: Int = 0,
    var quarantinedCount: Int = 0,
    @Column(length = 80)
    @Enumerated(EnumType.STRING)
    var resultCode: AdminOperationResultCode? = null,
) : BaseTime(id)
