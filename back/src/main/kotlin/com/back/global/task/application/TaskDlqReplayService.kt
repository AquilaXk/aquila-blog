package com.back.global.task.application

import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.domain.TaskStatus
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

data class TaskDlqReplayResult(
    val taskType: String?,
    val requestedLimit: Int,
    val replayedCount: Int,
    val resetRetryCount: Boolean,
    val replayedTaskIds: List<Long>,
)

/**
 * TaskDlqReplayService는 FAILED(DLQ) 태스크를 운영자가 재실행할 수 있게 한다.
 * replay 시 상태를 PENDING으로 복구하고 nextRetryAt을 즉시(now)로 당겨 처리 큐에 재투입한다.
 */
@Service
class TaskDlqReplayService(
    private val taskQueueRepository: TaskQueueRepositoryPort,
    private val meterRegistry: MeterRegistry? = null,
) {
    @Transactional
    fun replayFailedTasks(
        taskType: String?,
        limit: Int,
        resetRetryCount: Boolean,
    ): TaskDlqReplayResult {
        val safeLimit = limit.coerceIn(1, 200)
        val normalizedTaskType = taskType?.trim()?.takeIf { it.isNotBlank() }
        val now = Instant.now()
        val failedTasks =
            if (normalizedTaskType == null) {
                taskQueueRepository.findByStatusOrderByModifiedAtDesc(TaskStatus.FAILED, PageRequest.of(0, safeLimit))
            } else {
                taskQueueRepository.findByTaskTypeAndStatusOrderByModifiedAtDesc(
                    normalizedTaskType,
                    TaskStatus.FAILED,
                    PageRequest.of(0, safeLimit),
                )
            }

        if (failedTasks.isEmpty()) {
            return TaskDlqReplayResult(
                taskType = normalizedTaskType,
                requestedLimit = safeLimit,
                replayedCount = 0,
                resetRetryCount = resetRetryCount,
                replayedTaskIds = emptyList(),
            )
        }

        val replayedIds = mutableListOf<Long>()
        failedTasks.forEach { task ->
            task.status = TaskStatus.PENDING
            task.nextRetryAt = now
            task.errorMessage = "manual-dlq-replay@${now.epochSecond}"
            if (resetRetryCount) {
                task.retryCount = 0
            } else {
                task.retryCount = task.retryCount.coerceAtMost(task.maxRetries - 1)
            }
            taskQueueRepository.save(task)
            replayedIds += task.id
            val replayCounter =
                meterRegistry
                    ?.counter(
                        "task.dlq.replay.count",
                        "taskType",
                        task.taskType.ifBlank { "unknown" },
                    )
            replayCounter?.increment()
        }

        return TaskDlqReplayResult(
            taskType = normalizedTaskType,
            requestedLimit = safeLimit,
            replayedCount = replayedIds.size,
            resetRetryCount = resetRetryCount,
            replayedTaskIds = replayedIds,
        )
    }
}
