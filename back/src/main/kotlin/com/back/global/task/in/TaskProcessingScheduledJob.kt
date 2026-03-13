package com.back.global.task.`in`

import com.back.global.task.app.TaskHandlerRegistry
import com.back.global.task.out.TaskRepository
import com.back.standard.dto.TaskPayload
import com.back.standard.util.Ut
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.concurrent.Executors

@Component
class TaskProcessingScheduledJob(
    private val taskRepository: TaskRepository,
    private val taskHandlerRegistry: TaskHandlerRegistry,
    private val transactionTemplate: TransactionTemplate,
    @param:Value("\${custom.task.processor.batchSize:50}")
    private val batchSize: Int,
    @param:Value("\${custom.task.processor.processingTimeoutSeconds:900}")
    private val processingTimeoutSeconds: Long,
) {
    private val logger = LoggerFactory.getLogger(TaskProcessingScheduledJob::class.java)
    private val executor = Executors.newVirtualThreadPerTaskExecutor()

    @Scheduled(fixedDelayString = "\${custom.task.processor.fixedDelayMs}")
    @SchedulerLock(name = "processTasks", lockAtLeastFor = "PT1M")
    fun processTasks() {
        val safeBatchSize = batchSize.coerceIn(1, 500)
        recoverStaleProcessingTasks(safeBatchSize)

        val taskIds =
            transactionTemplate.execute {
                val pendingTasks = taskRepository.findPendingTasksWithLock(safeBatchSize)
                pendingTasks.forEach { it.markAsProcessing() }
                pendingTasks.map { it.id }
            }

        taskIds.orEmpty().forEach { taskId ->
            executor.submit { executeTask(taskId) }
        }
    }

    private fun recoverStaleProcessingTasks(limit: Int) {
        val stuckBefore = Instant.now().minusSeconds(processingTimeoutSeconds)
        val recoveredTaskIds =
            transactionTemplate.execute {
                val staleTasks = taskRepository.findStaleProcessingTasksWithLock(stuckBefore, limit)
                staleTasks.forEach {
                    it.recoverFromStuckProcessing("Recovered stale processing task")
                }
                staleTasks.map { it.id }
            } ?: emptyList()

        if (recoveredTaskIds.isNotEmpty()) {
            logger.warn("Recovered stale processing tasks: {}", recoveredTaskIds)
        }
    }

    private fun executeTask(taskId: Int) =
        transactionTemplate.execute {
            val task = taskRepository.findById(taskId).orElse(null) ?: return@execute

            try {
                val entry = taskHandlerRegistry.getEntry(task.taskType)

                if (entry != null) {
                    val payload = Ut.JSON.fromString(task.payload, entry.payloadClass) as TaskPayload
                    entry.handlerMethod.method.invoke(entry.handlerMethod.bean, payload)
                    task.markAsCompleted()
                } else {
                    logger.warn("No handler found for task type: ${task.taskType}")
                    task.errorMessage = "No handler found"
                    task.scheduleRetry()
                }
            } catch (e: Exception) {
                val rootCause = e.cause ?: e
                logger.error("Task failed: $taskId (retry: ${task.retryCount}/${task.maxRetries})", rootCause)
                task.errorMessage = rootCause.message ?: rootCause::class.simpleName
                task.scheduleRetry()
            }
        }
}
