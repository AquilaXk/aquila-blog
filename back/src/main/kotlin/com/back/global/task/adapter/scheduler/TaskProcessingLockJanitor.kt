package com.back.global.task.adapter.scheduler

import com.back.global.task.application.TaskProcessingLockDiagnosticsService
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(
    prefix = "custom.runtime",
    name = ["worker-enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class TaskProcessingLockJanitor(
    private val taskProcessingLockDiagnosticsService: TaskProcessingLockDiagnosticsService,
) {
    private val logger = LoggerFactory.getLogger(TaskProcessingLockJanitor::class.java)

    @EventListener(ApplicationReadyEvent::class)
    fun clearLegacyProcessTasksLockIfNeeded() {
        val result = taskProcessingLockDiagnosticsService.clearLegacyProcessTasksLockIfNeeded()
        if (result.attempted && result.deleted) {
            logger.warn(
                "Deleted legacy processTasks lock key={} ttlSeconds={} due to ready backlog",
                result.diagnostics.processTasksLockKey,
                result.diagnostics.processTasksLockTtlSeconds,
            )
        }
    }
}
