package com.back.global.task.domain

import com.back.global.task.application.TaskRetryPolicy
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

@org.junit.jupiter.api.DisplayName("Task 테스트")
class TaskTest {
    private val now = Instant.parse("2026-08-11T00:00:00Z")

    @Test
    fun `scheduleRetry는 retry policy를 기준으로 pending retry를 예약한다`() {
        val task = createTask(maxRetries = 5)
        val retryPolicy =
            TaskRetryPolicy(
                label = "테스트 작업",
                maxRetries = 5,
                baseDelaySeconds = 30,
                backoffMultiplier = 2.0,
                maxDelaySeconds = 300,
            )

        val before = Instant.now()

        task.scheduleRetry(retryPolicy, before)

        assertThat(task.status).isEqualTo(TaskStatus.PENDING)
        assertThat(task.retryCount).isEqualTo(1)
        assertThat(task.nextRetryAt).isAfterOrEqualTo(before.plusSeconds(30))
        assertThat(task.nextRetryAt).isBeforeOrEqualTo(before.plusSeconds(60))
    }

    @Test
    fun `scheduleRetry는 maxRetries에 도달하면 failed로 전환한다`() {
        val task = createTask(retryCount = 2, maxRetries = 3, payloadExpiresAt = now.plusSeconds(86_400))

        task.scheduleRetry(
            TaskRetryPolicy(
                label = "테스트 작업",
                maxRetries = 3,
                baseDelaySeconds = 30,
                backoffMultiplier = 2.0,
                maxDelaySeconds = 300,
            ),
            now,
        )

        assertThat(task.retryCount).isEqualTo(3)
        assertThat(task.status).isEqualTo(TaskStatus.FAILED)
        assertThat(task.payload).isEqualTo("{}")
        assertThat(task.payloadPurgeAfter).isEqualTo(now.plusSeconds(86_400))
        assertThat(task.rowPurgeAfter).isEqualTo(now.plusSeconds(30 * 86_400L))
    }

    @Test
    fun `completed task는 payload를 즉시 지우고 row를 7일 보존한다`() {
        val task = createTask()

        task.markAsCompleted(now)

        assertThat(task.status).isEqualTo(TaskStatus.COMPLETED)
        assertThat(task.payload).isEqualTo(Task.REDACTED_PAYLOAD)
        assertThat(task.payloadRedactedAt).isEqualTo(now)
        assertThat(task.payloadPurgeAfter).isEqualTo(now)
        assertThat(task.rowPurgeAfter).isEqualTo(now.plusSeconds(7 * 86_400L))
    }

    @Test
    fun `quarantined task는 payload를 즉시 지우고 row를 30일 보존한다`() {
        val task = createTask(status = TaskStatus.PROCESSING).also { it.markAsProcessing() }

        task.markAsQuarantined("MALFORMED_PAYLOAD", now)

        assertThat(task.status).isEqualTo(TaskStatus.QUARANTINED)
        assertThat(task.payload).isEqualTo(Task.REDACTED_PAYLOAD)
        assertThat(task.payloadRedactedAt).isEqualTo(now)
        assertThat(task.payloadPurgeAfter).isEqualTo(now)
        assertThat(task.rowPurgeAfter).isEqualTo(now.plusSeconds(30 * 86_400L))
        assertThat(task.executionLeaseToken).isNull()
    }

    @Test
    fun `recoverFromStuckProcessing는 메시지를 남기고 retry policy 기준으로 복구한다`() {
        val task = createTask(status = TaskStatus.PROCESSING, maxRetries = 4)
        val retryPolicy =
            TaskRetryPolicy(
                label = "테스트 작업",
                maxRetries = 4,
                baseDelaySeconds = 60,
                backoffMultiplier = 2.0,
                maxDelaySeconds = 600,
            )

        val before = Instant.now()

        task.recoverFromStuckProcessing("stale processing detected", retryPolicy, before)

        assertThat(task.status).isEqualTo(TaskStatus.PENDING)
        assertThat(task.retryCount).isEqualTo(1)
        assertThat(task.errorMessage).isEqualTo("stale processing detected")
        assertThat(task.nextRetryAt).isAfterOrEqualTo(before.plusSeconds(60))
        assertThat(task.nextRetryAt).isBeforeOrEqualTo(before.plusSeconds(120))
    }

    private fun createTask(
        status: TaskStatus = TaskStatus.PENDING,
        retryCount: Int = 0,
        maxRetries: Int = 5,
        payloadExpiresAt: Instant? = null,
    ): Task =
        Task(
            uid = UUID.randomUUID(),
            aggregateType = "test",
            aggregateId = 1,
            taskType = "test.task",
            payload = "{}",
            status = status,
            retryCount = retryCount,
            maxRetries = maxRetries,
            nextRetryAt = Instant.now(),
            payloadExpiresAt = payloadExpiresAt,
        )
}
