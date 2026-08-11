package com.back.global.task.application

import com.back.global.task.adapter.persistence.TaskRepository
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant

data class TaskRetentionCleanupResult(
    val redactedPayloadCount: Int,
    val purgedRowCount: Int,
)

@Service
class TaskRetentionService(
    private val taskRepository: TaskRepository,
    private val clock: Clock,
    private val meterRegistry: MeterRegistry? = null,
) {
    @Transactional
    fun cleanupBatch(limit: Int): TaskRetentionCleanupResult {
        val safeLimit = limit.coerceIn(1, 1_000)
        val now = Instant.now(clock)
        val redactedPayloadCount =
            taskRepository
                .findFailedPayloadsForRedactionWithLock(now, safeLimit)
                .count { task -> task.redactExpiredFailedPayload(now) }
        val purgeCandidates =
            taskRepository
                .findTerminalRowsForPurgeWithLock(now, safeLimit)
                .filter { task -> task.isTerminalRowPurgeEligible(now) }
        if (purgeCandidates.isNotEmpty()) {
            taskRepository.deleteAllInBatch(purgeCandidates)
        }
        recordAction("payload_redacted", redactedPayloadCount)
        recordAction("row_purged", purgeCandidates.size)
        return TaskRetentionCleanupResult(
            redactedPayloadCount = redactedPayloadCount,
            purgedRowCount = purgeCandidates.size,
        )
    }

    private fun recordAction(
        action: String,
        count: Int,
    ) {
        if (count <= 0) return
        meterRegistry?.counter("task.retention.action", "action", action)?.increment(count.toDouble())
    }
}
