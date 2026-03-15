package com.back.global.task.adapter.scheduler

import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.application.TaskHandlerRegistry
import com.back.global.task.domain.TaskStatus
import com.back.standard.dto.TaskPayload
import com.back.standard.util.Ut
import jakarta.annotation.PreDestroy
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

@Component
class TaskProcessingScheduledJob(
    private val taskRepository: TaskRepository,
    private val taskHandlerRegistry: TaskHandlerRegistry,
    private val transactionTemplate: TransactionTemplate,
    @param:Value("\${custom.task.processor.batchSize:50}")
    private val batchSize: Int,
    @param:Value("\${custom.task.processor.processingTimeoutSeconds:900}")
    private val processingTimeoutSeconds: Long,
    @param:Value("\${custom.task.processor.maxConcurrent:8}")
    private val maxConcurrent: Int,
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
                val payload = Ut.JSON.fromString(context.payload, entry.payloadClass) as TaskPayload
                entry.handlerMethod.method.invoke(entry.handlerMethod.bean, payload)
                markTaskCompleted(taskId)
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

    private fun markTaskCompleted(taskId: Int) {
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute
            if (task.status != TaskStatus.PROCESSING) return@execute
            task.markAsCompleted()
            task.errorMessage = null
        }
    }

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

    private fun revertTaskToPending(taskId: Int) {
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute
            if (task.status != TaskStatus.PROCESSING) return@execute
            task.status = TaskStatus.PENDING
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
