package com.back.global.task.application

import com.back.global.task.application.port.output.TaskQueueInsertPort
import com.back.global.task.application.port.output.TaskQueueInsertResult
import com.back.global.task.domain.Task
import com.back.standard.dto.ExpiringTaskPayload
import com.back.standard.dto.TaskPayload
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Service

@Service
class TaskFacade(
    private val taskInsertPort: TaskQueueInsertPort,
    private val taskHandlerRegistry: TaskHandlerRegistry,
    private val taskPayloadEnvelopeCodec: TaskPayloadEnvelopeCodec,
    private val meterRegistry: MeterRegistry? = null,
) {
    fun addToQueue(payload: TaskPayload): TaskQueueInsertResult {
        val entry =
            taskHandlerRegistry.getEntry(payload.javaClass)
                ?: error("No @TaskHandler registered for ${payload.javaClass.simpleName}")

        val result =
            taskInsertPort.insertIfAbsent(
                Task(
                    payload.uid,
                    payload.aggregateType,
                    payload.aggregateId,
                    entry.taskType,
                    taskPayloadEnvelopeCodec.encode(payload, entry),
                    entry.retryPolicy.maxRetries,
                    (payload as? ExpiringTaskPayload)?.expiresAt,
                ),
            )
        meterRegistry
            ?.counter(
                "task.queue.enqueue.result",
                "taskType",
                entry.taskType,
                "status",
                result.name.lowercase(),
            )?.increment()
        return result
    }
}
