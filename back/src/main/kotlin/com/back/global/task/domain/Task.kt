package com.back.global.task.domain

import com.back.global.jpa.domain.AfterDDL
import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.*
import jakarta.persistence.GenerationType.SEQUENCE
import org.hibernate.annotations.DynamicUpdate
import java.time.Instant
import java.util.*
import kotlin.math.pow

enum class TaskStatus {
    PENDING,
    PROCESSING,
    COMPLETED,
    FAILED,
}

@Entity
@DynamicUpdate
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS task_idx_status_next_retry_at
    ON task (status, next_retry_at ASC)
    """,
)
class Task(
    @field:Id
    @field:SequenceGenerator(name = "task_seq_gen", sequenceName = "task_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "task_seq_gen")
    override val id: Int = 0,
    @field:Column(unique = true)
    val uid: UUID,
    val aggregateType: String,
    val aggregateId: Int,
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
) : BaseTime(id) {
    constructor(uid: UUID, aggregateType: String, aggregateId: Int, taskType: String, payload: String) : this(
        0,
        uid,
        aggregateType,
        aggregateId,
        taskType,
        payload,
    )

    fun scheduleRetry() {
        retryCount++
        if (retryCount >= maxRetries) {
            status = TaskStatus.FAILED
        } else {
            status = TaskStatus.PENDING
            val delaySeconds = 60 * 3.0.pow(retryCount.toDouble()).toLong()
            nextRetryAt = Instant.now().plusSeconds(delaySeconds)
        }
    }

    fun markAsCompleted() {
        status = TaskStatus.COMPLETED
    }

    fun markAsProcessing() {
        status = TaskStatus.PROCESSING
    }

    fun recoverFromStuckProcessing(message: String) {
        retryCount++
        errorMessage = message

        if (retryCount >= maxRetries) {
            status = TaskStatus.FAILED
        } else {
            status = TaskStatus.PENDING
            nextRetryAt = Instant.now()
        }
    }
}
