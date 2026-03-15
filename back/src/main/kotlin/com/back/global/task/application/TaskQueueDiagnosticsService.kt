package com.back.global.task.application

import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import org.springframework.beans.factory.annotation.Value
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import java.time.Instant
import kotlin.math.max

data class TaskTypeDiagnostics(
    val taskType: String,
    val label: String,
    val pendingCount: Long,
    val readyPendingCount: Long,
    val delayedPendingCount: Long,
    val processingCount: Long,
    val failedCount: Long,
    val staleProcessingCount: Long,
    val oldestReadyPendingAt: Instant?,
    val oldestReadyPendingAgeSeconds: Long?,
    val latestFailureAt: Instant?,
    val latestFailureMessage: String?,
    val retryPolicy: TaskRetryPolicy,
)

data class TaskExecutionSample(
    val taskId: Int,
    val taskType: String,
    val label: String,
    val aggregateType: String,
    val aggregateId: Int,
    val status: TaskStatus,
    val retryCount: Int,
    val maxRetries: Int,
    val modifiedAt: Instant,
    val nextRetryAt: Instant,
    val errorMessage: String?,
)

data class TaskQueueDiagnostics(
    val pendingCount: Long,
    val readyPendingCount: Long,
    val delayedPendingCount: Long,
    val processingCount: Long,
    val completedCount: Long,
    val failedCount: Long,
    val staleProcessingCount: Long,
    val oldestReadyPendingAt: Instant?,
    val oldestProcessingAt: Instant?,
    val oldestReadyPendingAgeSeconds: Long?,
    val oldestProcessingAgeSeconds: Long?,
    val processingTimeoutSeconds: Long,
    val taskTypes: List<TaskTypeDiagnostics>,
    val recentFailures: List<TaskExecutionSample>,
    val staleProcessingSamples: List<TaskExecutionSample>,
)

@Service
class TaskQueueDiagnosticsService(
    private val taskRepository: TaskRepository,
    private val taskHandlerRegistry: TaskHandlerRegistry,
    @Value("\${custom.task.processor.processingTimeoutSeconds:900}")
    private val processingTimeoutSeconds: Long,
) {
    fun diagnoseQueue(): TaskQueueDiagnostics {
        val now = Instant.now()
        val readyPendingCount = taskRepository.countByStatusAndNextRetryAtLessThanEqual(TaskStatus.PENDING, now)
        val pendingCount = taskRepository.countByStatus(TaskStatus.PENDING)
        val stuckBefore = now.minusSeconds(processingTimeoutSeconds)
        val oldestReadyPending =
            taskRepository
                .findByStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
                    TaskStatus.PENDING,
                    now,
                    PageRequest.of(0, 1),
                ).firstOrNull()
        val oldestProcessing =
            taskRepository
                .findByStatusOrderByModifiedAtAsc(TaskStatus.PROCESSING, PageRequest.of(0, 1))
                .firstOrNull()

        return TaskQueueDiagnostics(
            pendingCount = pendingCount,
            readyPendingCount = readyPendingCount,
            delayedPendingCount = (pendingCount - readyPendingCount).coerceAtLeast(0),
            processingCount = taskRepository.countByStatus(TaskStatus.PROCESSING),
            completedCount = taskRepository.countByStatus(TaskStatus.COMPLETED),
            failedCount = taskRepository.countByStatus(TaskStatus.FAILED),
            staleProcessingCount = taskRepository.countByStatusAndModifiedAtBefore(TaskStatus.PROCESSING, stuckBefore),
            oldestReadyPendingAt = oldestReadyPending?.nextRetryAt,
            oldestProcessingAt = oldestProcessing?.modifiedAt,
            oldestReadyPendingAgeSeconds = oldestReadyPending?.nextRetryAt?.let { ageInSeconds(it, now) },
            oldestProcessingAgeSeconds = oldestProcessing?.modifiedAt?.let { ageInSeconds(it, now) },
            processingTimeoutSeconds = processingTimeoutSeconds,
            taskTypes =
                taskHandlerRegistry
                    .getRegisteredEntries()
                    .map { entry -> diagnoseTaskType(entry.taskType, now, stuckBefore) },
            recentFailures =
                taskRepository
                    .findByStatusOrderByModifiedAtDesc(TaskStatus.FAILED, PageRequest.of(0, 5))
                    .map(::toTaskExecutionSample),
            staleProcessingSamples =
                taskRepository
                    .findByStatusAndModifiedAtBeforeOrderByModifiedAtAsc(
                        TaskStatus.PROCESSING,
                        stuckBefore,
                        PageRequest.of(0, 5),
                    ).map(::toTaskExecutionSample),
        )
    }

    fun diagnoseTaskType(taskType: String): TaskTypeDiagnostics {
        val now = Instant.now()
        val stuckBefore = now.minusSeconds(processingTimeoutSeconds)

        return diagnoseTaskType(taskType, now, stuckBefore)
    }

    private fun diagnoseTaskType(
        taskType: String,
        now: Instant,
        stuckBefore: Instant,
    ): TaskTypeDiagnostics {
        val retryPolicy = taskHandlerRegistry.getRetryPolicy(taskType)
        val pendingCount = taskRepository.countByTaskTypeAndStatus(taskType, TaskStatus.PENDING)
        val readyPendingCount =
            taskRepository.countByTaskTypeAndStatusAndNextRetryAtLessThanEqual(
                taskType,
                TaskStatus.PENDING,
                now,
            )

        val oldestReadyPending =
            taskRepository
                .findByTaskTypeAndStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
                    taskType,
                    TaskStatus.PENDING,
                    now,
                    PageRequest.of(0, 1),
                ).firstOrNull()

        val latestFailure =
            taskRepository
                .findByTaskTypeAndStatusOrderByModifiedAtDesc(taskType, TaskStatus.FAILED, PageRequest.of(0, 1))
                .firstOrNull()

        return TaskTypeDiagnostics(
            taskType = taskType,
            label = retryPolicy.label,
            pendingCount = pendingCount,
            readyPendingCount = readyPendingCount,
            delayedPendingCount = max(0, pendingCount - readyPendingCount),
            processingCount = taskRepository.countByTaskTypeAndStatus(taskType, TaskStatus.PROCESSING),
            failedCount = taskRepository.countByTaskTypeAndStatus(taskType, TaskStatus.FAILED),
            staleProcessingCount =
                taskRepository.countByTaskTypeAndStatusAndModifiedAtBefore(
                    taskType,
                    TaskStatus.PROCESSING,
                    stuckBefore,
                ),
            oldestReadyPendingAt = oldestReadyPending?.nextRetryAt,
            oldestReadyPendingAgeSeconds = oldestReadyPending?.nextRetryAt?.let { ageInSeconds(it, now) },
            latestFailureAt = latestFailure?.modifiedAt,
            latestFailureMessage = latestFailure?.errorMessage,
            retryPolicy = retryPolicy,
        )
    }

    private fun toTaskExecutionSample(task: Task): TaskExecutionSample {
        val retryPolicy = taskHandlerRegistry.getRetryPolicy(task.taskType)

        return TaskExecutionSample(
            taskId = task.id,
            taskType = task.taskType,
            label = retryPolicy.label,
            aggregateType = task.aggregateType,
            aggregateId = task.aggregateId,
            status = task.status,
            retryCount = task.retryCount,
            maxRetries = task.maxRetries,
            modifiedAt = task.modifiedAt,
            nextRetryAt = task.nextRetryAt,
            errorMessage = task.errorMessage,
        )
    }

    private fun ageInSeconds(
        target: Instant,
        now: Instant,
    ): Long = max(0, now.epochSecond - target.epochSecond)
}
