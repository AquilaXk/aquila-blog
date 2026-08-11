package com.back.global.task.application

import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.domain.TaskStatus
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
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
    private val taskHandlerRegistry: TaskHandlerRegistry,
    private val taskPayloadEnvelopeCodec: TaskPayloadEnvelopeCodec,
    private val clock: Clock,
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
        val now = Instant.now(clock)
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
            val entry = taskHandlerRegistry.getEntry(task.taskType)
            if (entry == null) {
                task.markAsQuarantined(TaskQuarantineReason.UNKNOWN_TASK_TYPE.name, now)
                taskQueueRepository.save(task)
                return@forEach
            }
            try {
                taskPayloadEnvelopeCodec.decode(
                    rawEnvelope = task.payload,
                    storedMetadata =
                        StoredTaskPayloadMetadata(
                            uid = task.uid,
                            aggregateType = task.aggregateType,
                            aggregateId = task.aggregateId,
                            taskType = task.taskType,
                        ),
                    entry = entry,
                )
            } catch (exception: TaskPayloadQuarantineException) {
                task.markAsQuarantined(exception.reason.name, now)
                taskQueueRepository.save(task)
                return@forEach
            }
            task.replayFailed(now, resetRetryCount)
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
