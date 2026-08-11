package com.back.global.task.application

import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.standard.dto.TaskPayload
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.UUID

class TaskHandlerRegistryTest {
    @Test
    fun `handler entry는 current schema와 exact decoder registry만 허용한다`() {
        assertThatThrownBy {
            entry(
                schemaVersion = 1,
                decoders = mapOf(1 to TaskPayloadDecoder(1, StubTaskPayload::class.java)),
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Current task payload schema must be 2")

        assertThatThrownBy {
            entry(
                decoders = mapOf(2 to TaskPayloadDecoder(2, StubTaskPayload::class.java)),
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Task payload decoders must register exact v1 and v2")

        assertThatThrownBy {
            entry(
                decoders =
                    mapOf(
                        1 to TaskPayloadDecoder(1, StubTaskPayload::class.java),
                        2 to TaskPayloadDecoder(1, StubTaskPayload::class.java),
                    ),
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Task payload decoder key and schemaVersion must match")
    }

    @Test
    fun `registry는 type lookup을 제공하고 duplicate handler를 fail closed한다`() {
        val registry = TaskHandlerRegistry()
        val first = entry()
        registry.register(TASK_TYPE, first)

        assertThat(first.decoders.keys).containsExactlyInAnyOrder(1, 2)
        assertThat(registry.getType(StubTaskPayload::class.java)).isEqualTo(TASK_TYPE)
        assertThatThrownBy { registry.register(TASK_TYPE, entry()) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Duplicate @TaskHandler for type '$TASK_TYPE'")
            .hasMessageContaining("StubTaskHandler")
    }

    private fun entry(
        schemaVersion: Int = 2,
        decoders: Map<Int, TaskPayloadDecoder> =
            mapOf(
                1 to TaskPayloadDecoder(1, StubTaskPayload::class.java),
                2 to TaskPayloadDecoder(2, StubTaskPayload::class.java),
            ),
    ): TaskHandlerEntry {
        val handler = StubTaskHandler()
        return TaskHandlerEntry(
            taskType = TASK_TYPE,
            payloadClass = StubTaskPayload::class.java,
            handlerMethod =
                TaskHandlerMethod(
                    bean = handler,
                    method = StubTaskHandler::class.java.getDeclaredMethod("handle", TaskPayload::class.java),
                ),
            retryPolicy = TaskRetryPolicy("test", 3, 1, 2.0, 10),
            schemaVersion = schemaVersion,
            sensitivity = TaskPayloadSensitivity.INTERNAL,
            decoders = decoders,
        )
    }

    private data class StubTaskPayload(
        override val uid: UUID,
        override val aggregateType: String,
        override val aggregateId: Long,
    ) : TaskPayload

    private class StubTaskHandler {
        fun handle(payload: TaskPayload) = Unit
    }

    private companion object {
        const val TASK_TYPE = "test.registry"
    }
}
