package com.back.global.task.application

import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import org.springframework.beans.factory.annotation.Value
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.max

/**
 * TaskTypeDiagnostics는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */
data class TaskTypeDiagnostics(
    val taskType: String,
    val label: String,
    val pendingCount: Long,
    val readyPendingCount: Long,
    val delayedPendingCount: Long,
    val processingCount: Long,
    val backlogCount: Long = 0,
    val queueLagSeconds: Long? = null,
    val failedCount: Long,
    val staleProcessingCount: Long,
    val oldestReadyPendingAt: Instant?,
    val oldestReadyPendingAgeSeconds: Long?,
    val latestFailureAt: Instant?,
    val latestFailureMessage: String?,
    val retryPolicy: TaskRetryPolicy,
)

/**
 * TaskExecutionSample는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */
data class TaskExecutionSample(
    val taskId: Long,
    val taskType: String,
    val label: String,
    val aggregateType: String,
    val aggregateId: Long,
    val status: TaskStatus,
    val retryCount: Int,
    val maxRetries: Int,
    val modifiedAt: Instant,
    val nextRetryAt: Instant,
    val errorMessage: String?,
)

/**
 * TaskQueueDiagnostics는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */
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

/**
 * TaskQueueDiagnosticsService는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */

@Service
class TaskQueueDiagnosticsService(
    private val taskRepository: TaskQueueRepositoryPort,
    private val taskHandlerRegistry: TaskHandlerRegistry,
    @Value("\${custom.task.processor.processingTimeoutSeconds:900}")
    private val processingTimeoutSeconds: Long,
    @Value("\${custom.task.diagnostics.cacheSeconds:3}")
    private val diagnosticsCacheSeconds: Long,
) {
    private data class DiagnosticsSnapshot(
        val createdAt: Instant,
        val value: TaskQueueDiagnostics,
    )

    private val diagnosticsSnapshotRef = AtomicReference<DiagnosticsSnapshot?>(null)

    /**
     * diagnoseQueue 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    fun diagnoseQueue(): TaskQueueDiagnostics {
        val now = Instant.now()
        diagnosticsSnapshotRef.get()?.let { snapshot ->
            val ageSeconds = now.epochSecond - snapshot.createdAt.epochSecond
            if (ageSeconds in 0..diagnosticsCacheSeconds.coerceAtLeast(0)) {
                return snapshot.value
            }
        }

        val refreshed = buildDiagnostics(now)
        diagnosticsSnapshotRef.set(DiagnosticsSnapshot(now, refreshed))
        return refreshed
    }

    /**
     * buildDiagnostics 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
    private fun buildDiagnostics(now: Instant): TaskQueueDiagnostics {
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

    /**
     * diagnoseTaskType 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
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
        val processingCount = taskRepository.countByTaskTypeAndStatus(taskType, TaskStatus.PROCESSING)
        val queueLagSeconds = oldestReadyPending?.nextRetryAt?.let { ageInSeconds(it, now) }

        return TaskTypeDiagnostics(
            taskType = taskType,
            label = retryPolicy.label,
            pendingCount = pendingCount,
            readyPendingCount = readyPendingCount,
            delayedPendingCount = max(0, pendingCount - readyPendingCount),
            processingCount = processingCount,
            backlogCount = pendingCount + processingCount,
            queueLagSeconds = queueLagSeconds,
            failedCount = taskRepository.countByTaskTypeAndStatus(taskType, TaskStatus.FAILED),
            staleProcessingCount =
                taskRepository.countByTaskTypeAndStatusAndModifiedAtBefore(
                    taskType,
                    TaskStatus.PROCESSING,
                    stuckBefore,
                ),
            oldestReadyPendingAt = oldestReadyPending?.nextRetryAt,
            oldestReadyPendingAgeSeconds = queueLagSeconds,
            latestFailureAt = latestFailure?.modifiedAt,
            latestFailureMessage = latestFailure?.errorMessage,
            retryPolicy = retryPolicy,
        )
    }

    /**
     * toTaskExecutionSample 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
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
