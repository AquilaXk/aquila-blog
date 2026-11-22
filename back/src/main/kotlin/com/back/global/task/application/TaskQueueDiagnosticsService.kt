package com.back.global.task.application

import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.application.port.output.TaskTypeReadyAggregate
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import org.springframework.beans.factory.annotation.Value
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.max

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
 * 참조 구현: felixmosh/bull-board (MIT) — Single-pass conditional aggregation for queue diagnostics
 */
@Service
class TaskQueueDiagnosticsService(
    private val taskRepository: TaskQueueRepositoryPort,
    private val taskHandlerRegistry: TaskHandlerRegistry,
    @Value("\${custom.task.processor.processingTimeoutSeconds:900}")
    private val processingTimeoutSeconds: Long,
    @Value("\${custom.task.diagnostics.cacheSeconds:30}")
    private val diagnosticsCacheSeconds: Long,
) {
    private data class DiagnosticsSnapshot(
        val createdAt: Instant,
        val value: TaskQueueDiagnostics,
    )

    private val diagnosticsSnapshotRef = AtomicReference<DiagnosticsSnapshot?>(null)

    @Transactional(readOnly = true)
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

    private class MutableTypeCounts {
        var pendingCount = 0L
        var processingCount = 0L
        var failedCount = 0L
    }

    private class CollectedQueueAggregates(
        val pendingCount: Long,
        val readyPendingCount: Long,
        val processingCount: Long,
        val completedCount: Long,
        val failedCount: Long,
        val staleProcessingCount: Long,
        val oldestReadyPendingAt: Instant?,
        val oldestProcessingAt: Instant?,
        val countsByType: Map<String, MutableTypeCounts>,
        val readyByType: Map<String, TaskTypeReadyAggregate>,
        val staleByType: Map<String, Long>,
        val latestFailureByType: Map<String, Task>,
    )

    private fun buildDiagnostics(now: Instant): TaskQueueDiagnostics {
        val stuckBefore = now.minusSeconds(processingTimeoutSeconds)
        val aggregates = collectQueueAggregates(now, stuckBefore)

        return TaskQueueDiagnostics(
            pendingCount = aggregates.pendingCount,
            readyPendingCount = aggregates.readyPendingCount,
            delayedPendingCount = (aggregates.pendingCount - aggregates.readyPendingCount).coerceAtLeast(0),
            processingCount = aggregates.processingCount,
            completedCount = aggregates.completedCount,
            failedCount = aggregates.failedCount,
            staleProcessingCount = aggregates.staleProcessingCount,
            oldestReadyPendingAt = aggregates.oldestReadyPendingAt,
            oldestProcessingAt = aggregates.oldestProcessingAt,
            oldestReadyPendingAgeSeconds = aggregates.oldestReadyPendingAt?.let { ageInSeconds(it, now) },
            oldestProcessingAgeSeconds = aggregates.oldestProcessingAt?.let { ageInSeconds(it, now) },
            processingTimeoutSeconds = processingTimeoutSeconds,
            taskTypes =
                taskHandlerRegistry
                    .getRegisteredEntries()
                    .map { entry -> assembleTypeDiagnostics(entry.taskType, entry.retryPolicy, now, aggregates) },
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

    @Transactional(readOnly = true)
    fun diagnoseTaskType(taskType: String): TaskTypeDiagnostics {
        val now = Instant.now()
        val stuckBefore = now.minusSeconds(processingTimeoutSeconds)
        val aggregates = collectQueueAggregates(now, stuckBefore)
        return assembleTypeDiagnostics(taskType, taskHandlerRegistry.getRetryPolicy(taskType), now, aggregates)
    }

    private fun collectQueueAggregates(
        now: Instant,
        stuckBefore: Instant,
    ): CollectedQueueAggregates {
        var pendingCount = 0L
        var readyPendingCount = 0L
        var processingCount = 0L
        var completedCount = 0L
        var failedCount = 0L
        var staleProcessingCount = 0L
        var oldestReadyPendingAt: Instant? = null
        var oldestProcessingAt: Instant? = null
        val countsByType = HashMap<String, MutableTypeCounts>()
        val readyByType = HashMap<String, TaskTypeReadyAggregate>()
        val staleByType = HashMap<String, Long>()

        val snapshots = taskRepository.summarizeQueueSnapshotByTaskType(now, stuckBefore)
        for (row in snapshots) {
            pendingCount += row.pendingCount
            readyPendingCount += row.readyPendingCount
            processingCount += row.processingCount
            completedCount += row.completedCount
            failedCount += row.failedCount
            staleProcessingCount += row.staleProcessingCount

            row.oldestReadyAt?.let { oldestReadyPendingAt = earliestInstant(oldestReadyPendingAt, it) }
            row.oldestProcessingAt?.let { oldestProcessingAt = earliestInstant(oldestProcessingAt, it) }

            val typeCounts = countsByType.getOrPut(row.taskType) { MutableTypeCounts() }
            typeCounts.pendingCount = row.pendingCount
            typeCounts.processingCount = row.processingCount
            typeCounts.failedCount = row.failedCount

            readyByType[row.taskType] = TaskTypeReadyAggregate(row.taskType, row.readyPendingCount, row.oldestReadyAt)
            staleByType[row.taskType] = row.staleProcessingCount
        }

        val latestFailureByType =
            if (failedCount > 0L) {
                taskRepository.findLatestFailedTasksByTaskType().associateBy { it.taskType }
            } else {
                emptyMap()
            }

        return CollectedQueueAggregates(
            pendingCount = pendingCount,
            readyPendingCount = readyPendingCount,
            processingCount = processingCount,
            completedCount = completedCount,
            failedCount = failedCount,
            staleProcessingCount = staleProcessingCount,
            oldestReadyPendingAt = oldestReadyPendingAt,
            oldestProcessingAt = oldestProcessingAt,
            countsByType = countsByType,
            readyByType = readyByType,
            staleByType = staleByType,
            latestFailureByType = latestFailureByType,
        )
    }

    private fun assembleTypeDiagnostics(
        taskType: String,
        retryPolicy: TaskRetryPolicy,
        now: Instant,
        aggregates: CollectedQueueAggregates,
    ): TaskTypeDiagnostics {
        val counts = aggregates.countsByType[taskType]
        val pendingCount = counts?.pendingCount ?: 0L
        val processingCount = counts?.processingCount ?: 0L
        val failedCount = counts?.failedCount ?: 0L
        val readySummary = aggregates.readyByType[taskType]
        val readyPendingCount = readySummary?.count ?: 0L
        val oldestReadyPendingAt = readySummary?.oldestReadyAt
        val queueLagSeconds = oldestReadyPendingAt?.let { ageInSeconds(it, now) }
        val staleProcessingCount = aggregates.staleByType[taskType] ?: 0L
        val latestFailure = aggregates.latestFailureByType[taskType]

        return TaskTypeDiagnostics(
            taskType = taskType,
            label = retryPolicy.label,
            pendingCount = pendingCount,
            readyPendingCount = readyPendingCount,
            delayedPendingCount = max(0, pendingCount - readyPendingCount),
            processingCount = processingCount,
            backlogCount = pendingCount + processingCount,
            queueLagSeconds = queueLagSeconds,
            failedCount = failedCount,
            staleProcessingCount = staleProcessingCount,
            oldestReadyPendingAt = oldestReadyPendingAt,
            oldestReadyPendingAgeSeconds = queueLagSeconds,
            latestFailureAt = latestFailure?.modifiedAt,
            latestFailureMessage = latestFailure?.errorMessage,
            retryPolicy = retryPolicy,
        )
    }

    private fun earliestInstant(
        current: Instant?,
        candidate: Instant,
    ): Instant = if (current == null || candidate.isBefore(current)) candidate else current

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
