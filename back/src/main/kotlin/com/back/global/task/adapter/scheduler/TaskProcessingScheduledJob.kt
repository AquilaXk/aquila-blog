package com.back.global.task.adapter.scheduler

import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.application.TaskHandlerEntry
import com.back.global.task.application.TaskHandlerRegistry
import com.back.global.task.domain.TaskStatus
import com.back.standard.dto.TaskPayload
import io.micrometer.core.instrument.MeterRegistry
import jakarta.annotation.PreDestroy
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import kotlin.math.ceil

/**
 * TaskProcessingScheduledJob는 주기 작업을 트리거하는 스케줄러 어댑터입니다.
 * 정기 실행 중 오류가 전체 처리 흐름으로 전파되지 않도록 실패를 격리합니다.
 */
@Component
@ConditionalOnProperty(
    prefix = "custom.runtime",
    name = ["worker-enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class TaskProcessingScheduledJob(
    private val taskRepository: TaskRepository,
    private val taskHandlerRegistry: TaskHandlerRegistry,
    private val transactionTemplate: TransactionTemplate,
    private val objectMapper: ObjectMapper,
    @param:Value("\${custom.task.processor.batchSize:50}")
    private val batchSize: Int,
    @param:Value("\${custom.task.processor.processingTimeoutSeconds:900}")
    private val processingTimeoutSeconds: Long,
    @param:Value("\${custom.task.processor.maxConcurrent:8}")
    private val maxConcurrent: Int,
    @param:Value("\${custom.task.processor.handlerTimeoutSeconds:120}")
    private val handlerTimeoutSeconds: Long,
    @param:Value("\${custom.task.processor.dynamicConcurrencyEnabled:true}")
    private val dynamicConcurrencyEnabled: Boolean,
    @param:Value("\${custom.task.processor.dynamicMinConcurrent:2}")
    private val dynamicMinConcurrent: Int,
    @param:Value("\${custom.task.processor.dynamicBacklogPerSlot:25}")
    private val dynamicBacklogPerSlot: Int,
    @param:Value("\${custom.task.processor.perTypeMaxConcurrent:}")
    perTypeMaxConcurrentRaw: String,
    private val meterRegistry: MeterRegistry? = null,
) {
    private val logger = LoggerFactory.getLogger(TaskProcessingScheduledJob::class.java)
    private val workerConcurrency = maxConcurrent.coerceIn(1, 256)
    private val concurrencyGate = Semaphore(workerConcurrency)
    private val executor = Executors.newVirtualThreadPerTaskExecutor()
    private val perTypeMaxConcurrent = parsePerTypeMaxConcurrent(perTypeMaxConcurrentRaw)
    private val perTypeGates =
        perTypeMaxConcurrent
            .mapValues { (_, limit) -> Semaphore(limit.coerceAtLeast(1)) }
            .toMutableMap()

    private data class TaskExecutionContext(
        val taskId: Long,
        val taskType: String,
        val payload: String,
    )

    private data class TaskDispatchSlot(
        val taskId: Long,
        val taskType: String,
    )

    /**
     * processTasks 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
    @Scheduled(fixedDelayString = "\${custom.task.processor.fixedDelayMs}")
    @SchedulerLock(name = "processTasks", lockAtLeastFor = "PT1M")
    fun processTasks() {
        val safeBatchSize = batchSize.coerceIn(1, 500)
        recoverStaleProcessingTasks(safeBatchSize)

        val availableWorkerSlots = resolveAvailableWorkerSlots()
        if (availableWorkerSlots <= 0) {
            logger.debug("Skip polling tasks because no worker slot is available")
            return
        }

        val fetchLimit = minOf(safeBatchSize, availableWorkerSlots)
        val dispatchSlots =
            transactionTemplate.execute {
                val pendingTasks = taskRepository.findPendingTasksWithLock(fetchLimit)
                pendingTasks.forEach { it.markAsProcessing() }
                pendingTasks.map { TaskDispatchSlot(it.id, it.taskType) }
            } ?: emptyList()

        dispatchSlots.forEach { slot ->
            if (!concurrencyGate.tryAcquire()) {
                revertTaskToPending(slot.taskId)
                return@forEach
            }
            if (!tryAcquirePerTypePermit(slot.taskType)) {
                concurrencyGate.release()
                revertTaskToPending(slot.taskId)
                return@forEach
            }

            executor.submit {
                try {
                    executeTask(slot.taskId)
                } finally {
                    releasePerTypePermit(slot.taskType)
                    concurrencyGate.release()
                }
            }
        }
    }

    private fun resolveAvailableWorkerSlots(): Int {
        val activeWorkers = (workerConcurrency - concurrencyGate.availablePermits()).coerceAtLeast(0)
        val targetConcurrency =
            if (!dynamicConcurrencyEnabled) {
                workerConcurrency
            } else {
                val readyPending = taskRepository.countByStatusAndNextRetryAtLessThanEqual(TaskStatus.PENDING, Instant.now())
                val backlogPerSlot = dynamicBacklogPerSlot.coerceAtLeast(1)
                val scaled = ceil(readyPending.toDouble() / backlogPerSlot).toInt().coerceAtLeast(1)
                val minConcurrency = dynamicMinConcurrent.coerceIn(1, workerConcurrency)
                scaled.coerceIn(minConcurrency, workerConcurrency)
            }

        return (targetConcurrency - activeWorkers).coerceIn(0, workerConcurrency)
    }

    private fun tryAcquirePerTypePermit(taskType: String): Boolean {
        val gate = perTypeGates[taskType] ?: return true
        return gate.tryAcquire()
    }

    private fun releasePerTypePermit(taskType: String) {
        val gate = perTypeGates[taskType] ?: return
        gate.release()
    }

    private fun parsePerTypeMaxConcurrent(raw: String): Map<String, Int> =
        raw
            .split(",")
            .asSequence()
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .mapNotNull { token ->
                val parts = token.split("=", limit = 2)
                if (parts.size != 2) return@mapNotNull null
                val taskType = parts[0].trim()
                val limit = parts[1].trim().toIntOrNull()?.coerceIn(1, workerConcurrency) ?: return@mapNotNull null
                if (taskType.isBlank()) return@mapNotNull null
                taskType to limit
            }.toMap()

    /**
     * 만료/중단 상태를 정리해 리소스와 큐 정합성을 유지합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
    private fun recoverStaleProcessingTasks(limit: Int) {
        val stuckBefore = Instant.now().minusSeconds(processingTimeoutSeconds)
        val recoveredTaskIds =
            transactionTemplate.execute {
                val staleTasks = taskRepository.findStaleProcessingTasksWithLock(stuckBefore, limit)
                staleTasks.forEach {
                    it.recoverFromStuckProcessing(
                        "Recovered stale processing task",
                        taskHandlerRegistry.getRetryPolicy(it.taskType),
                    )
                }
                staleTasks.map { it.id }
            } ?: emptyList()

        if (recoveredTaskIds.isNotEmpty()) {
            logger.warn("Recovered stale processing tasks: {}", recoveredTaskIds)
        }
    }

    private fun executeTask(taskId: Long) =
        run {
            val context = loadTaskExecutionContext(taskId) ?: return
            val entry = taskHandlerRegistry.getEntry(context.taskType)
            val startedAtNanos = System.nanoTime()

            if (entry == null) {
                logger.warn("No handler found for task type: {}", context.taskType)
                markTaskFailed(taskId, context.taskType, "No handler found")
                return
            }

            try {
                val payload = objectMapper.readValue(context.payload, entry.payloadClass) as TaskPayload
                invokeHandlerWithTimeout(context.taskId, context.taskType, entry, payload)
                markTaskCompleted(taskId, context.taskType)
                recordTaskDuration(context.taskType, startedAtNanos)
            } catch (exception: TimeoutException) {
                logger.error(
                    "Task handler timeout: {} (type={}, timeoutSeconds={})",
                    taskId,
                    context.taskType,
                    handlerTimeoutSeconds,
                )
                markTaskFailed(taskId, context.taskType, "Task handler timed out after ${handlerTimeoutSeconds}s")
                recordTaskDuration(context.taskType, startedAtNanos)
            } catch (exception: Exception) {
                val rootCause = exception.cause ?: exception
                logger.error("Task failed: {} (type={})", taskId, context.taskType, rootCause)
                markTaskFailed(taskId, context.taskType, rootCause.message ?: rootCause::class.simpleName)
                recordTaskDuration(context.taskType, startedAtNanos)
            }
        }

    private fun loadTaskExecutionContext(taskId: Long): TaskExecutionContext? =
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute null
            if (task.status != TaskStatus.PROCESSING) return@execute null
            TaskExecutionContext(task.id, task.taskType, task.payload)
        }

    /**
     * 작업 상태를 전이하고 실패 시 복구 가능한 상태로 보정합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
    private fun markTaskCompleted(
        taskId: Long,
        taskType: String,
    ) {
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute
            if (task.status != TaskStatus.PROCESSING) return@execute
            task.markAsCompleted()
            task.errorMessage = null
        }
        recordTaskResult(taskType, "success")
    }

    /**
     * 작업 상태를 전이하고 실패 시 복구 가능한 상태로 보정합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
    private fun markTaskFailed(
        taskId: Long,
        taskType: String,
        errorMessage: String?,
    ) {
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute
            if (task.status != TaskStatus.PROCESSING) return@execute
            task.errorMessage = errorMessage
            task.scheduleRetry(taskHandlerRegistry.getRetryPolicy(taskType))
            if (task.status == TaskStatus.FAILED) {
                logger.error(
                    "task_dead_lettered taskId={} taskType={} retryCount={} maxRetries={}",
                    task.id,
                    taskType,
                    task.retryCount,
                    task.maxRetries,
                )
            }
            recordTaskResult(taskType, if (task.status == TaskStatus.FAILED) "dlq" else "retry")
        }
    }

    private fun recordTaskResult(
        taskType: String,
        status: String,
    ) {
        meterRegistry
            ?.counter("task.processor.result", "taskType", safeTagValue(taskType), "status", status)
            ?.increment()
    }

    private fun recordTaskDuration(
        taskType: String,
        startedAtNanos: Long,
    ) {
        val elapsedMs = (System.nanoTime() - startedAtNanos).coerceAtLeast(0L) / 1_000_000
        meterRegistry
            ?.timer("task.processor.handler.duration", "taskType", safeTagValue(taskType))
            ?.record(elapsedMs, TimeUnit.MILLISECONDS)
    }

    private fun safeTagValue(raw: String): String {
        val sanitized = raw.trim().replace(Regex("[^a-zA-Z0-9._-]"), "_")
        return sanitized.take(80).ifBlank { "unknown" }
    }

    /**
     * 작업 상태를 전이하고 실패 시 복구 가능한 상태로 보정합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
    private fun revertTaskToPending(taskId: Long) {
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute
            if (task.status != TaskStatus.PROCESSING) return@execute
            task.status = TaskStatus.PENDING
        }
    }

    /**
     * 핸들러를 제한 시간 내 실행하고 타임아웃/예외를 분리 처리합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
    private fun invokeHandlerWithTimeout(
        taskId: Long,
        taskType: String,
        entry: TaskHandlerEntry,
        payload: TaskPayload,
    ) {
        val timeoutSeconds = handlerTimeoutSeconds.coerceIn(5, 3600)
        val future =
            executor.submit<Unit> {
                entry.handlerMethod.method.invoke(entry.handlerMethod.bean, payload)
            }

        try {
            future.get(timeoutSeconds, TimeUnit.SECONDS)
        } catch (timeout: TimeoutException) {
            future.cancel(true)
            throw timeout
        } catch (executionException: ExecutionException) {
            val cause = executionException.cause
            if (cause is Exception) throw cause
            logger.error(
                "Task handler failed with non-exception throwable (taskId={}, taskType={})",
                taskId,
                taskType,
                cause,
            )
            throw RuntimeException(cause)
        } catch (interruptedException: InterruptedException) {
            Thread.currentThread().interrupt()
            logger.warn(
                "Task worker interrupted while executing handler (taskId={}, taskType={})",
                taskId,
                taskType,
            )
            throw interruptedException
        }
    }

    @PreDestroy
    fun shutdownExecutor() {
        executor.shutdown()
        if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
            executor.shutdownNow()
        }
    }
}
