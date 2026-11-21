package com.back.global.task.application

import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.global.task.application.port.output.TaskQueueInsertPort
import com.back.global.task.application.port.output.TaskQueueInsertResult
import com.back.global.task.domain.Task
import com.back.standard.dto.TaskPayload
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.time.Clock
import java.util.UUID

class TaskFacadeTest {
    @Test
    @DisplayName("addToQueue는 payload UID를 atomic insert UID로 고정한다")
    fun `add to queue uses payload uid as atomic insert uid`() {
        val insertPort = RecordingTaskQueueInsertPort()
        val facade = createFacade(insertPort)
        val payloadUid = UUID.randomUUID()

        val result = facade.addToQueue(StubTaskPayload(uid = payloadUid))

        assertThat(result).isEqualTo(TaskQueueInsertResult.INSERTED)
        assertThat(insertPort.insertedTasks).singleElement().extracting<UUID> { it.uid }.isEqualTo(payloadUid)
    }

    @Test
    @DisplayName("addToQueue는 같은 payload UID 중복을 명시적 duplicate 결과로 반환한다")
    fun `add to queue returns explicit duplicate result for same payload uid`() {
        val insertPort = RecordingTaskQueueInsertPort()
        val meterRegistry = SimpleMeterRegistry()
        val facade = createFacade(insertPort, meterRegistry = meterRegistry)
        val payload = StubTaskPayload(uid = UUID.randomUUID())

        assertThat(facade.addToQueue(payload)).isEqualTo(TaskQueueInsertResult.INSERTED)
        assertThat(facade.addToQueue(payload)).isEqualTo(TaskQueueInsertResult.DUPLICATE)
        assertThat(insertPort.insertedTasks).hasSize(1)
        assertThat(
            meterRegistry
                .get("task.queue.enqueue.result")
                .tags("taskType", StubTaskPayload.TASK_TYPE, "status", "inserted")
                .counter()
                .count(),
        ).isEqualTo(1.0)
        assertThat(
            meterRegistry
                .get("task.queue.enqueue.result")
                .tags("taskType", StubTaskPayload.TASK_TYPE, "status", "duplicate")
                .counter()
                .count(),
        ).isEqualTo(1.0)
    }

    @Test
    @DisplayName("addToQueue는 inserted와 duplicate 모두 handler를 inline 실행하지 않는다")
    fun `add to queue never runs handler inline`() {
        val insertPort = RecordingTaskQueueInsertPort()
        val handler = StubTaskHandler()
        val facade = createFacade(insertPort, handler)
        val payload = StubTaskPayload(uid = UUID.randomUUID())

        facade.addToQueue(payload)
        facade.addToQueue(payload)

        assertThat(handler.handledPayloads).isEmpty()
    }

    @Test
    @DisplayName("atomic insert 장애는 alternate 실행 없이 호출자에게 전파한다")
    fun `atomic insert failure is propagated without alternate execution`() {
        val failure = IllegalStateException("atomic insert unavailable")
        val insertPort = RecordingTaskQueueInsertPort(failure)
        val handler = StubTaskHandler()
        val facade = createFacade(insertPort, handler)

        assertThatThrownBy {
            facade.addToQueue(StubTaskPayload(uid = UUID.randomUUID()))
        }.isSameAs(failure)
        assertThat(handler.handledPayloads).isEmpty()
    }

    private fun createFacade(
        insertPort: TaskQueueInsertPort,
        handler: StubTaskHandler = StubTaskHandler(),
        meterRegistry: SimpleMeterRegistry? = null,
    ): TaskFacade {
        val objectMapper = jacksonObjectMapper()
        val registry = TaskHandlerRegistry()
        registry.register(
            StubTaskPayload.TASK_TYPE,
            TaskHandlerEntry.withCurrentDecoder(
                taskType = StubTaskPayload.TASK_TYPE,
                payloadClass = StubTaskPayload::class.java,
                handlerMethod =
                    TaskHandlerMethod(
                        bean = handler,
                        method = StubTaskHandler::class.java.getDeclaredMethod("handle", StubTaskPayload::class.java),
                    ),
                retryPolicy =
                    TaskRetryPolicy(
                        label = "test task",
                        maxRetries = 3,
                        baseDelaySeconds = 1,
                        backoffMultiplier = 2.0,
                        maxDelaySeconds = 10,
                    ),
                schemaVersion = 2,
                sensitivity = TaskPayloadSensitivity.INTERNAL,
            ),
        )
        return TaskFacade(
            taskInsertPort = insertPort,
            taskHandlerRegistry = registry,
            taskPayloadEnvelopeCodec = TaskPayloadEnvelopeCodec(objectMapper, Clock.systemUTC()),
            meterRegistry = meterRegistry,
        )
    }

    private data class StubTaskPayload(
        override val uid: UUID,
        override val aggregateType: String = "test",
        override val aggregateId: Long = 1L,
    ) : TaskPayload {
        companion object {
            const val TASK_TYPE = "test.task-facade"
        }
    }

    private class StubTaskHandler {
        val handledPayloads = mutableListOf<StubTaskPayload>()

        fun handle(payload: StubTaskPayload) {
            handledPayloads += payload
        }
    }

    private class RecordingTaskQueueInsertPort(
        private val failure: RuntimeException? = null,
    ) : TaskQueueInsertPort {
        private val tasksByUid = linkedMapOf<UUID, Task>()
        val insertedTasks: List<Task>
            get() = tasksByUid.values.toList()

        override fun insertIfAbsent(task: Task): TaskQueueInsertResult {
            failure?.let { throw it }
            if (tasksByUid.containsKey(task.uid)) {
                return TaskQueueInsertResult.DUPLICATE
            }
            tasksByUid[task.uid] = task
            return TaskQueueInsertResult.INSERTED
        }
    }
}
