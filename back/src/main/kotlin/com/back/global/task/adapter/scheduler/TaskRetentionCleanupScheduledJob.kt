package com.back.global.task.adapter.scheduler

import com.back.global.task.application.TaskRetentionService
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(
    prefix = "custom.runtime",
    name = ["worker-enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class TaskRetentionCleanupScheduledJob(
    private val taskRetentionService: TaskRetentionService,
    @param:Value("\${custom.task.retention.cleanupBatchSize:100}")
    private val cleanupBatchSize: Int,
    @param:Value("\${custom.task.retention.cleanupMaxBatches:10}")
    private val cleanupMaxBatches: Int,
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${custom.task.retention.cleanupFixedDelayMs:3600000}")
    @SchedulerLock(name = "taskRetentionCleanup", lockAtLeastFor = "PT1M")
    fun cleanup() {
        val safeBatchSize = cleanupBatchSize.coerceIn(1, 1_000)
        val safeMaxBatches = cleanupMaxBatches.coerceIn(1, 100)
        var redactedPayloadCount = 0
        var purgedRowCount = 0
        var completedBatches = 0

        while (completedBatches < safeMaxBatches) {
            val result = taskRetentionService.cleanupBatch(safeBatchSize)
            redactedPayloadCount += result.redactedPayloadCount
            purgedRowCount += result.purgedRowCount
            completedBatches += 1
            if (result.redactedPayloadCount < safeBatchSize && result.purgedRowCount < safeBatchSize) {
                break
            }
        }

        if (redactedPayloadCount > 0 || purgedRowCount > 0) {
            logger.info(
                "task_retention_cleanup redactedPayloadCount={} purgedRowCount={}",
                redactedPayloadCount,
                purgedRowCount,
            )
        }
    }
}
