package com.back.global.task.model

import com.back.global.jpa.domain.AfterDDL
import com.back.global.jpa.domain.BaseTime
import com.back.global.task.application.TaskRetryPolicy
import jakarta.persistence.*
import jakarta.persistence.GenerationType.SEQUENCE
import org.hibernate.annotations.DynamicUpdate
import java.time.Instant
import java.util.*

/**
 * TaskStatus는 글로벌 모듈 도메인 상태와 규칙을 표현하는 모델입니다.
 * 불변조건을 유지하며 상태 전이를 메서드 단위로 캡슐화합니다.
 */
enum class TaskStatus {
    PENDING,
    PROCESSING,
    COMPLETED,
    FAILED,
    QUARANTINED,
}

/**
 * Task는 글로벌 모듈 도메인 상태와 규칙을 표현하는 모델입니다.
 * 불변조건을 유지하며 상태 전이를 메서드 단위로 캡슐화합니다.
 */
@Entity
@DynamicUpdate
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS task_idx_status_next_retry_at
    ON task (status, next_retry_at ASC)
    """,
)
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS task_idx_status_modified_at
    ON task (status, modified_at ASC)
    """,
)
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS task_idx_task_type_status_next_retry_at
    ON task (task_type, status, next_retry_at ASC)
    """,
)
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS task_idx_task_type_status_modified_at
    ON task (task_type, status, modified_at ASC)
    """,
)
class Task(
    @field:Id
    @field:SequenceGenerator(name = "task_seq_gen", sequenceName = "task_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "task_seq_gen")
    override val id: Long = 0,
    @field:Column(unique = true)
    val uid: UUID,
    val aggregateType: String,
    val aggregateId: Long,
    val taskType: String,
    @field:Column(columnDefinition = "TEXT")
    var payload: String,
    var payloadExpiresAt: Instant? = null,
    var payloadPurgeAfter: Instant? = null,
    var payloadRedactedAt: Instant? = null,
    var rowPurgeAfter: Instant? = null,
    @field:Enumerated(EnumType.STRING)
    var status: TaskStatus = TaskStatus.PENDING,
    var retryCount: Int = 0,
    var maxRetries: Int = 10,
    var nextRetryAt: Instant = Instant.now(),
    @field:Column(columnDefinition = "TEXT")
    var errorMessage: String? = null,
    var executionLeaseToken: UUID? = null,
) : BaseTime(id) {
    constructor(
        uid: UUID,
        aggregateType: String,
        aggregateId: Long,
        taskType: String,
        payload: String,
        maxRetries: Int,
        payloadExpiresAt: Instant? = null,
    ) : this(
        id = 0,
        uid = uid,
        aggregateType = aggregateType,
        aggregateId = aggregateId,
        taskType = taskType,
        payload = payload,
        payloadExpiresAt = payloadExpiresAt,
        maxRetries = maxRetries,
    )

    fun scheduleRetry(
        retryPolicy: TaskRetryPolicy,
        now: Instant,
    ) {
        retryCount++
        executionLeaseToken = null
        if (retryCount >= maxRetries) {
            status = TaskStatus.FAILED
            payloadPurgeAfter = earlierOf(now.plusSeconds(FAILED_PAYLOAD_RETENTION_SECONDS), payloadExpiresAt)
            rowPurgeAfter = now.plusSeconds(FAILED_ROW_RETENTION_SECONDS)
        } else {
            status = TaskStatus.PENDING
            val delaySeconds = retryPolicy.nextDelaySeconds(retryCount)
            nextRetryAt = now.plusSeconds(delaySeconds)
        }
    }

    fun markAsCompleted(now: Instant) {
        status = TaskStatus.COMPLETED
        executionLeaseToken = null
        redactPayload(now)
        rowPurgeAfter = now.plusSeconds(COMPLETED_ROW_RETENTION_SECONDS)
    }

    fun markAsQuarantined(
        reasonCode: String,
        now: Instant,
    ) {
        require(reasonCode.isNotBlank()) { "Task quarantine reason must not be blank" }
        status = TaskStatus.QUARANTINED
        redactPayload(now)
        errorMessage = reasonCode
        executionLeaseToken = null
        rowPurgeAfter = now.plusSeconds(QUARANTINED_ROW_RETENTION_SECONDS)
    }

    fun markAsProcessing(): UUID {
        val leaseToken = UUID.randomUUID()
        status = TaskStatus.PROCESSING
        executionLeaseToken = leaseToken
        return leaseToken
    }

    fun isCurrentExecution(leaseToken: UUID): Boolean = status == TaskStatus.PROCESSING && executionLeaseToken == leaseToken

    fun clearProcessingLease() {
        executionLeaseToken = null
    }

    fun recoverFromStuckProcessing(
        message: String,
        retryPolicy: TaskRetryPolicy,
        now: Instant,
    ) {
        retryCount++
        errorMessage = message
        executionLeaseToken = null

        if (retryCount >= maxRetries) {
            status = TaskStatus.FAILED
            payloadPurgeAfter = earlierOf(now.plusSeconds(FAILED_PAYLOAD_RETENTION_SECONDS), payloadExpiresAt)
            rowPurgeAfter = now.plusSeconds(FAILED_ROW_RETENTION_SECONDS)
        } else {
            status = TaskStatus.PENDING
            nextRetryAt = now.plusSeconds(retryPolicy.nextDelaySeconds(retryCount))
        }
    }

    fun replayFailed(
        now: Instant,
        resetRetryCount: Boolean,
    ) {
        check(status == TaskStatus.FAILED) { "Only FAILED tasks may be replayed" }
        check(payloadRedactedAt == null) { "Redacted FAILED task payload cannot be replayed" }
        status = TaskStatus.PENDING
        nextRetryAt = now
        errorMessage = "manual-dlq-replay@${now.epochSecond}"
        retryCount = if (resetRetryCount) 0 else retryCount.coerceAtMost(maxRetries - 1)
        payloadPurgeAfter = null
        rowPurgeAfter = null
    }

    fun redactExpiredFailedPayload(now: Instant): Boolean {
        if (
            status != TaskStatus.FAILED ||
            executionLeaseToken != null ||
            payloadRedactedAt != null ||
            payloadPurgeAfter == null ||
            payloadPurgeAfter!!.isAfter(now)
        ) {
            return false
        }
        redactPayload(now)
        return true
    }

    fun isTerminalRowPurgeEligible(now: Instant): Boolean =
        status in TERMINAL_STATUSES &&
            executionLeaseToken == null &&
            rowPurgeAfter?.let { deadline -> !deadline.isAfter(now) } == true

    private fun redactPayload(now: Instant) {
        payload = REDACTED_PAYLOAD
        payloadRedactedAt = now
        payloadPurgeAfter = now
    }

    private fun earlierOf(
        retentionLimit: Instant,
        payloadExpiry: Instant?,
    ): Instant = if (payloadExpiry != null && payloadExpiry.isBefore(retentionLimit)) payloadExpiry else retentionLimit

    companion object {
        const val REDACTED_PAYLOAD = "{\"redacted\":true}"
        const val COMPLETED_ROW_RETENTION_SECONDS = 7 * 86_400L
        const val FAILED_PAYLOAD_RETENTION_SECONDS = 7 * 86_400L
        const val FAILED_ROW_RETENTION_SECONDS = 30 * 86_400L
        const val QUARANTINED_ROW_RETENTION_SECONDS = 30 * 86_400L
        private val TERMINAL_STATUSES = setOf(TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.QUARANTINED)
    }
}
