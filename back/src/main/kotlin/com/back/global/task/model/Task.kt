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
    val payload: String,
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
    ) : this(
        0,
        uid,
        aggregateType,
        aggregateId,
        taskType,
        payload,
        maxRetries = maxRetries,
    )

    fun scheduleRetry(retryPolicy: TaskRetryPolicy) {
        retryCount++
        executionLeaseToken = null
        if (retryCount >= maxRetries) {
            status = TaskStatus.FAILED
        } else {
            status = TaskStatus.PENDING
            val delaySeconds = retryPolicy.nextDelaySeconds(retryCount)
            nextRetryAt = Instant.now().plusSeconds(delaySeconds)
        }
    }

    fun markAsCompleted() {
        status = TaskStatus.COMPLETED
        executionLeaseToken = null
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
    ) {
        retryCount++
        errorMessage = message
        executionLeaseToken = null

        if (retryCount >= maxRetries) {
            status = TaskStatus.FAILED
        } else {
            status = TaskStatus.PENDING
            nextRetryAt = Instant.now().plusSeconds(retryPolicy.nextDelaySeconds(retryCount))
        }
    }
}
