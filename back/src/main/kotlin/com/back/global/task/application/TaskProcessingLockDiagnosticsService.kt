package com.back.global.task.application

import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.domain.TaskStatus
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.concurrent.TimeUnit

data class TaskProcessingLockDiagnostics(
    val currentNodeWorkerEnabled: Boolean,
    val currentNodeApiMode: String,
    val processTasksLockKey: String,
    val processTasksLockExists: Boolean,
    val processTasksLockTtlSeconds: Long?,
    val legacyOrphanLikely: Boolean,
)

data class TaskProcessingLockCleanupResult(
    val attempted: Boolean,
    val deleted: Boolean,
    val diagnostics: TaskProcessingLockDiagnostics,
)

@Service
class TaskProcessingLockDiagnosticsService(
    private val stringRedisTemplateProvider: ObjectProvider<StringRedisTemplate>,
    private val taskQueueRepository: TaskQueueRepositoryPort,
    @Value("\${custom.runtime.workerEnabled:true}")
    private val currentNodeWorkerEnabled: Boolean,
    @Value("\${custom.runtime.apiMode:all}")
    private val currentNodeApiMode: String,
    @Value("\${custom.task.processor.legacyLockCleanupThresholdSeconds:300}")
    private val legacyLockCleanupThresholdSeconds: Long,
) {
    companion object {
        const val PROCESS_TASKS_LOCK_KEY = "job-lock:default:processTasks"
    }

    fun diagnose(): TaskProcessingLockDiagnostics {
        val redisTemplate = stringRedisTemplateProvider.getIfAvailable()
        val processTasksLockExists = redisTemplate?.hasKey(PROCESS_TASKS_LOCK_KEY) == true
        val processTasksLockTtlSeconds =
            if (processTasksLockExists) {
                redisTemplate
                    ?.getExpire(PROCESS_TASKS_LOCK_KEY, TimeUnit.SECONDS)
                    ?.takeIf { it >= 0 }
            } else {
                null
            }

        val now = Instant.now()
        val readyPendingCount = taskQueueRepository.countByStatusAndNextRetryAtLessThanEqual(TaskStatus.PENDING, now)
        val processingCount = taskQueueRepository.countByStatus(TaskStatus.PROCESSING)
        val legacyOrphanLikely =
            processTasksLockExists &&
                readyPendingCount > 0 &&
                processingCount == 0L &&
                (processTasksLockTtlSeconds ?: -1) > legacyLockCleanupThresholdSeconds

        return TaskProcessingLockDiagnostics(
            currentNodeWorkerEnabled = currentNodeWorkerEnabled,
            currentNodeApiMode = currentNodeApiMode,
            processTasksLockKey = PROCESS_TASKS_LOCK_KEY,
            processTasksLockExists = processTasksLockExists,
            processTasksLockTtlSeconds = processTasksLockTtlSeconds,
            legacyOrphanLikely = legacyOrphanLikely,
        )
    }

    fun clearLegacyProcessTasksLockIfNeeded(): TaskProcessingLockCleanupResult {
        val diagnostics = diagnose()
        if (!currentNodeWorkerEnabled || !diagnostics.legacyOrphanLikely) {
            return TaskProcessingLockCleanupResult(
                attempted = false,
                deleted = false,
                diagnostics = diagnostics,
            )
        }

        val deleted = stringRedisTemplateProvider.getIfAvailable()?.delete(PROCESS_TASKS_LOCK_KEY) == true

        return TaskProcessingLockCleanupResult(
            attempted = true,
            deleted = deleted,
            diagnostics = diagnostics,
        )
    }
}
