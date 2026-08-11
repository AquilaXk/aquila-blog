package com.back.global.task.application

import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import com.back.standard.dto.ExpiringTaskPayload
import com.back.standard.dto.TaskPayload
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.data.domain.PageRequest
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class TaskDlqReplayServiceTest {
    private val now = Instant.parse("2026-08-11T00:00:00Z")
    private val objectMapper = jacksonObjectMapper()
    private val codec = TaskPayloadEnvelopeCodec(objectMapper, Clock.fixed(now, ZoneOffset.UTC))

    @Test
    fun `only an exact valid failed envelope is replayed and invalid rows are quarantined`() {
        val repository = mock(TaskQueueRepositoryPort::class.java)
        val registry = registry()
        val validPayload = StubPayload(UUID.randomUUID(), "Post", 101L)
        val valid = failedTask(101L, VALID_TASK_TYPE, validPayload, codec.encode(validPayload, registry.getEntry(VALID_TASK_TYPE)!!))
        val malformed = failedTask(102L, VALID_TASK_TYPE, validPayload.copy(uid = UUID.randomUUID()), "private-malformed-data")
        val unknown = failedTask(103L, "unknown.task.type", validPayload.copy(uid = UUID.randomUUID()), "private-unknown-data")
        val expiredPayload = ExpiringStubPayload(UUID.randomUUID(), "Member", 104L, now.minusSeconds(1))
        val expired =
            failedTask(
                id = 104L,
                taskType = EXPIRING_TASK_TYPE,
                payload = expiredPayload,
                rawEnvelope = expiredEnvelope(expiredPayload),
            )
        `when`(
            repository.findByStatusOrderByModifiedAtDesc(
                TaskStatus.FAILED,
                PageRequest.of(0, 10),
            ),
        ).thenReturn(listOf(valid, malformed, unknown, expired))
        val service = TaskDlqReplayService(repository, registry, codec)

        val result = service.replayFailedTasks(taskType = null, limit = 10, resetRetryCount = true)

        assertThat(result.replayedTaskIds).containsExactly(101L)
        assertThat(result.replayedCount).isEqualTo(1)
        assertThat(valid.status).isEqualTo(TaskStatus.PENDING)
        assertThat(valid.retryCount).isZero()
        assertQuarantined(malformed, TaskQuarantineReason.MALFORMED_ENVELOPE)
        assertQuarantined(unknown, TaskQuarantineReason.UNKNOWN_TASK_TYPE)
        assertQuarantined(expired, TaskQuarantineReason.EXPIRED_PAYLOAD)
        verify(repository).save(valid)
        verify(repository).save(malformed)
        verify(repository).save(unknown)
        verify(repository).save(expired)
    }

    private fun registry(): TaskHandlerRegistry =
        TaskHandlerRegistry().apply {
            register(VALID_TASK_TYPE, entry(VALID_TASK_TYPE, StubPayload::class.java, TaskPayloadSensitivity.INTERNAL))
            register(
                EXPIRING_TASK_TYPE,
                entry(EXPIRING_TASK_TYPE, ExpiringStubPayload::class.java, TaskPayloadSensitivity.EXPIRING_SECRET),
            )
        }

    private fun <T : TaskPayload> entry(
        taskType: String,
        payloadClass: Class<T>,
        sensitivity: TaskPayloadSensitivity,
    ): TaskHandlerEntry {
        val handler = StubHandler()

        @Suppress("UNCHECKED_CAST")
        val typedClass = payloadClass as Class<out TaskPayload>
        return TaskHandlerEntry.withExactDecoders(
            taskType = taskType,
            payloadClass = typedClass,
            handlerMethod =
                TaskHandlerMethod(
                    bean = handler,
                    method = StubHandler::class.java.getDeclaredMethod("handle", TaskPayload::class.java),
                ),
            retryPolicy = TaskRetryPolicy(taskType, 3, 1, 2.0, 10),
            schemaVersion = 2,
            sensitivity = sensitivity,
        )
    }

    private fun failedTask(
        id: Long,
        taskType: String,
        payload: TaskPayload,
        rawEnvelope: String,
    ): Task =
        Task(
            id = id,
            uid = payload.uid,
            aggregateType = payload.aggregateType,
            aggregateId = payload.aggregateId,
            taskType = taskType,
            payload = rawEnvelope,
            status = TaskStatus.FAILED,
            retryCount = 3,
            maxRetries = 3,
        )

    private fun expiredEnvelope(payload: ExpiringStubPayload): String =
        objectMapper.writeValueAsString(
            TaskPayloadEnvelope(
                schemaVersion = 2,
                taskType = EXPIRING_TASK_TYPE,
                sensitivity = TaskPayloadSensitivity.EXPIRING_SECRET,
                createdAtEpochMs = now.minusSeconds(60).toEpochMilli(),
                expiresAtEpochMs = payload.expiresAt.toEpochMilli(),
                payloadJson = objectMapper.writeValueAsString(payload),
            ),
        )

    private fun assertQuarantined(
        task: Task,
        reason: TaskQuarantineReason,
    ) {
        assertThat(task.status).isEqualTo(TaskStatus.QUARANTINED)
        assertThat(task.payload).isEqualTo(Task.REDACTED_PAYLOAD)
        assertThat(task.errorMessage).isEqualTo(reason.name)
    }

    private data class StubPayload(
        override val uid: UUID,
        override val aggregateType: String,
        override val aggregateId: Long,
    ) : TaskPayload

    private data class ExpiringStubPayload(
        override val uid: UUID,
        override val aggregateType: String,
        override val aggregateId: Long,
        override val expiresAt: Instant,
    ) : ExpiringTaskPayload

    private class StubHandler {
        fun handle(payload: TaskPayload) = Unit
    }

    private companion object {
        const val VALID_TASK_TYPE = "test.dlq.valid"
        const val EXPIRING_TASK_TYPE = "test.dlq.expiring"
    }
}
