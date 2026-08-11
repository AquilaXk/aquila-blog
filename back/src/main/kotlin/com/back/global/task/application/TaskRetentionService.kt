package com.back.global.task.application

import com.back.global.task.adapter.persistence.TaskRepository
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
) {
    @Transactional
    fun cleanupBatch(limit: Int): TaskRetentionCleanupResult {
        val safeLimit = limit.coerceIn(1, 1_000)
        val now = Instant.now(clock)
        val redactedPayloadCount =
            taskRepository
                .findFailedPayloadsForRedactionWithLock(now, safeLimit)
                .count { task -> task.redactExpiredFailedPayload(now) }
        val purgeCandidates = taskRepository.findTerminalRowsForPurgeWithLock(now, safeLimit)
        if (purgeCandidates.isNotEmpty()) {
            taskRepository.deleteAllInBatch(purgeCandidates)
        }
        return TaskRetentionCleanupResult(
            redactedPayloadCount = redactedPayloadCount,
            purgedRowCount = purgeCandidates.size,
        )
    }
}
