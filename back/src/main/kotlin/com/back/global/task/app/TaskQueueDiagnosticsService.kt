package com.back.global.task.app

import com.back.global.task.domain.TaskStatus
import com.back.global.task.out.TaskRepository
import org.springframework.beans.factory.annotation.Value
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import java.time.Instant

data class TaskTypeDiagnostics(
    val taskType: String,
    val pendingCount: Long,
    val processingCount: Long,
    val failedCount: Long,
    val staleProcessingCount: Long,
    val oldestReadyPendingAt: Instant?,
    val latestFailureAt: Instant?,
    val latestFailureMessage: String?,
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
    val processingTimeoutSeconds: Long,
)

@Service
class TaskQueueDiagnosticsService(
    private val taskRepository: TaskRepository,
    @Value("\${custom.task.processor.processingTimeoutSeconds:900}")
    private val processingTimeoutSeconds: Long,
) {
    fun diagnoseQueue(): TaskQueueDiagnostics {
        val now = Instant.now()
        val readyPendingCount = taskRepository.countByStatusAndNextRetryAtLessThanEqual(TaskStatus.PENDING, now)
        val pendingCount = taskRepository.countByStatus(TaskStatus.PENDING)
        val stuckBefore = now.minusSeconds(processingTimeoutSeconds)

        return TaskQueueDiagnostics(
            pendingCount = pendingCount,
            readyPendingCount = readyPendingCount,
            delayedPendingCount = (pendingCount - readyPendingCount).coerceAtLeast(0),
            processingCount = taskRepository.countByStatus(TaskStatus.PROCESSING),
            completedCount = taskRepository.countByStatus(TaskStatus.COMPLETED),
            failedCount = taskRepository.countByStatus(TaskStatus.FAILED),
            staleProcessingCount = taskRepository.countByStatusAndModifiedAtBefore(TaskStatus.PROCESSING, stuckBefore),
            oldestReadyPendingAt =
                taskRepository
                    .findByStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
                        TaskStatus.PENDING,
                        now,
                        PageRequest.of(0, 1),
                    ).firstOrNull()
                    ?.nextRetryAt,
            oldestProcessingAt =
                taskRepository
                    .findByStatusOrderByModifiedAtAsc(TaskStatus.PROCESSING, PageRequest.of(0, 1))
                    .firstOrNull()
                    ?.modifiedAt,
            processingTimeoutSeconds = processingTimeoutSeconds,
        )
    }

    fun diagnoseTaskType(taskType: String): TaskTypeDiagnostics {
        val now = Instant.now()
        val stuckBefore = now.minusSeconds(processingTimeoutSeconds)

        val latestFailure =
            taskRepository
                .findByTaskTypeAndStatusOrderByModifiedAtDesc(taskType, TaskStatus.FAILED, PageRequest.of(0, 1))
                .firstOrNull()

        return TaskTypeDiagnostics(
            taskType = taskType,
            pendingCount = taskRepository.countByTaskTypeAndStatus(taskType, TaskStatus.PENDING),
            processingCount = taskRepository.countByTaskTypeAndStatus(taskType, TaskStatus.PROCESSING),
            failedCount = taskRepository.countByTaskTypeAndStatus(taskType, TaskStatus.FAILED),
            staleProcessingCount =
                taskRepository.countByTaskTypeAndStatusAndModifiedAtBefore(
                    taskType,
                    TaskStatus.PROCESSING,
                    stuckBefore,
                ),
            oldestReadyPendingAt =
                taskRepository
                    .findByTaskTypeAndStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
                        taskType,
                        TaskStatus.PENDING,
                        now,
                        PageRequest.of(0, 1),
                    ).firstOrNull()
                    ?.nextRetryAt,
            latestFailureAt = latestFailure?.modifiedAt,
            latestFailureMessage = latestFailure?.errorMessage,
        )
    }
}
