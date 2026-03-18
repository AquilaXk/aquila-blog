package com.back.global.task.adapter.scheduler

import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.application.TaskHandlerEntry
import com.back.global.task.application.TaskHandlerRegistry
import com.back.global.task.domain.TaskStatus
import com.back.standard.dto.TaskPayload
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
) {
    private val logger = LoggerFactory.getLogger(TaskProcessingScheduledJob::class.java)
    private val workerConcurrency = maxConcurrent.coerceIn(1, 256)
    private val concurrencyGate = Semaphore(workerConcurrency)
    private val executor = Executors.newVirtualThreadPerTaskExecutor()

    private data class TaskExecutionContext(
        val taskId: Int,
        val taskType: String,
        val payload: String,
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

        val availableWorkerSlots = concurrencyGate.availablePermits()
        if (availableWorkerSlots <= 0) {
            logger.debug("Skip polling tasks because no worker slot is available")
            return
        }

        val fetchLimit = minOf(safeBatchSize, availableWorkerSlots)
        val taskIds =
            transactionTemplate.execute {
                val pendingTasks = taskRepository.findPendingTasksWithLock(fetchLimit)
                pendingTasks.forEach { it.markAsProcessing() }
                pendingTasks.map { it.id }
            }

        taskIds.orEmpty().forEach { taskId ->
            if (!concurrencyGate.tryAcquire()) {
                revertTaskToPending(taskId)
                return@forEach
            }

            executor.submit {
                try {
                    executeTask(taskId)
                } finally {
                    concurrencyGate.release()
                }
            }
        }
    }

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

    private fun executeTask(taskId: Int) =
        run {
            val context = loadTaskExecutionContext(taskId) ?: return
            val entry = taskHandlerRegistry.getEntry(context.taskType)

            if (entry == null) {
                logger.warn("No handler found for task type: {}", context.taskType)
                markTaskFailed(taskId, context.taskType, "No handler found")
                return
            }

            try {
                val payload = objectMapper.readValue(context.payload, entry.payloadClass) as TaskPayload
                invokeHandlerWithTimeout(context.taskId, context.taskType, entry, payload)
                markTaskCompleted(taskId)
            } catch (exception: TimeoutException) {
                logger.error(
                    "Task handler timeout: {} (type={}, timeoutSeconds={})",
                    taskId,
                    context.taskType,
                    handlerTimeoutSeconds,
                )
                markTaskFailed(taskId, context.taskType, "Task handler timed out after ${handlerTimeoutSeconds}s")
            } catch (exception: Exception) {
                val rootCause = exception.cause ?: exception
                logger.error("Task failed: {} (type={})", taskId, context.taskType, rootCause)
                markTaskFailed(taskId, context.taskType, rootCause.message ?: rootCause::class.simpleName)
            }
        }

    private fun loadTaskExecutionContext(taskId: Int): TaskExecutionContext? =
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute null
            if (task.status != TaskStatus.PROCESSING) return@execute null
            TaskExecutionContext(task.id, task.taskType, task.payload)
        }

    /**
     * 작업 상태를 전이하고 실패 시 복구 가능한 상태로 보정합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
    private fun markTaskCompleted(taskId: Int) {
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute
            if (task.status != TaskStatus.PROCESSING) return@execute
            task.markAsCompleted()
            task.errorMessage = null
        }
    }

    /**
     * 작업 상태를 전이하고 실패 시 복구 가능한 상태로 보정합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
    private fun markTaskFailed(
        taskId: Int,
        taskType: String,
        errorMessage: String?,
    ) {
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute
            if (task.status != TaskStatus.PROCESSING) return@execute
            task.errorMessage = errorMessage
            task.scheduleRetry(taskHandlerRegistry.getRetryPolicy(taskType))
        }
    }

    /**
     * 작업 상태를 전이하고 실패 시 복구 가능한 상태로 보정합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
    private fun revertTaskToPending(taskId: Int) {
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
        taskId: Int,
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
