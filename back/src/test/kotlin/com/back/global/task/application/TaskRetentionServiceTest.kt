package com.back.global.task.application

import com.back.global.task.application.port.output.TaskRetentionRepositoryPort
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class TaskRetentionServiceTest {
    private val now = Instant.parse("2026-08-11T00:00:00Z")

    @Test
    fun `cleanup은 due terminal payload와 row만 bounded 처리하고 lease와 processing을 보존한다`() {
        val repository = mock(TaskRetentionRepositoryPort::class.java)
        val meterRegistry = SimpleMeterRegistry()
        val service =
            TaskRetentionService(
                taskRepository = repository,
                clock = Clock.fixed(now, ZoneOffset.UTC),
                meterRegistry = meterRegistry,
            )
        val failed = task(1, TaskStatus.FAILED, payloadPurgeAfter = now.minusSeconds(1))
        val leasedFailed =
            task(2, TaskStatus.FAILED, payloadPurgeAfter = now.minusSeconds(1)).apply {
                executionLeaseToken = UUID.randomUUID()
            }
        val completed = task(3, TaskStatus.COMPLETED, rowPurgeAfter = now.minusSeconds(1))
        val processing = task(4, TaskStatus.PROCESSING, rowPurgeAfter = now.minusSeconds(1))
        `when`(repository.findFailedPayloadsForRedactionWithLock(now, 1_000))
            .thenReturn(listOf(failed, leasedFailed))
        `when`(repository.findTerminalRowsForPurgeWithLock(now, 1_000))
            .thenReturn(listOf(completed, processing))

        val result = service.cleanupBatch(5_000)

        assertThat(result).isEqualTo(TaskRetentionCleanupResult(redactedPayloadCount = 1, purgedRowCount = 1))
        assertThat(failed.payload).isEqualTo(Task.REDACTED_PAYLOAD)
        assertThat(leasedFailed.payload).isEqualTo("payload-2")
        verify(repository).deleteAllInBatch(listOf(completed))
        assertThat(
            meterRegistry
                .get("task.retention.action")
                .tag("action", "payload_redacted")
                .counter()
                .count(),
        ).isEqualTo(1.0)
        assertThat(
            meterRegistry
                .get("task.retention.action")
                .tag("action", "row_purged")
                .counter()
                .count(),
        ).isEqualTo(1.0)
    }

    @Test
    fun `cleanup은 meter registry가 없어도 empty batch를 명시적으로 완료한다`() {
        val repository = mock(TaskRetentionRepositoryPort::class.java)
        `when`(repository.findFailedPayloadsForRedactionWithLock(now, 1)).thenReturn(emptyList())
        `when`(repository.findTerminalRowsForPurgeWithLock(now, 1)).thenReturn(emptyList())
        val service =
            TaskRetentionService(
                taskRepository = repository,
                clock = Clock.fixed(now, ZoneOffset.UTC),
            )

        assertThat(service.cleanupBatch(0))
            .isEqualTo(TaskRetentionCleanupResult(redactedPayloadCount = 0, purgedRowCount = 0))
    }

    private fun task(
        id: Long,
        status: TaskStatus,
        payloadPurgeAfter: Instant? = null,
        rowPurgeAfter: Instant? = null,
    ): Task =
        Task(
            id = id,
            uid = UUID.randomUUID(),
            aggregateType = "test",
            aggregateId = id,
            taskType = "test.retention",
            payload = "payload-$id",
            payloadPurgeAfter = payloadPurgeAfter,
            rowPurgeAfter = rowPurgeAfter,
            status = status,
        )
}
