package com.back.global.task.application

import com.back.global.task.annotation.Task
import com.back.global.task.annotation.TaskHandler
import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.global.task.config.TaskHandlerConfigurer
import com.back.standard.dto.TaskPayload
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.aop.framework.ProxyFactory
import org.springframework.context.event.ContextRefreshedEvent
import org.springframework.context.support.GenericApplicationContext
import java.util.UUID

class TaskHandlerRegistryTest {
    @Test
    fun `handler entry는 v2 schema만 허용한다`() {
        assertThatThrownBy {
            entry(schemaVersion = 1)
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Current task payload schema must be 2")
    }

    @Test
    fun `registry는 type lookup을 제공하고 duplicate handler를 fail closed한다`() {
        val registry = TaskHandlerRegistry()
        val first = entry()
        registry.register(TASK_TYPE, first)

        assertThat(first.schemaVersion).isEqualTo(TaskHandlerRegistry.CURRENT_TASK_PAYLOAD_SCHEMA_VERSION)
        assertThat(registry.getType(StubTaskPayload::class.java)).isEqualTo(TASK_TYPE)
        assertThatThrownBy { registry.register(TASK_TYPE, entry()) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Duplicate @TaskHandler for type '$TASK_TYPE'")
            .hasMessageContaining("StubTaskHandler")
    }

    @Test
    fun `configurer는 CGLIB 프록시로 감싸진 빈의 TaskHandler 메서드도 등록한다`() {
        val context = GenericApplicationContext()
        val proxyFactory =
            ProxyFactory(ProxiedStubTaskHandler()).apply {
                isProxyTargetClass = true
            }
        context.registerBean(
            "proxiedStubTaskHandler",
            ProxiedStubTaskHandler::class.java,
            java.util.function.Supplier { proxyFactory.proxy as ProxiedStubTaskHandler },
        )
        context.refresh()

        val registry = TaskHandlerRegistry()
        val configurer = TaskHandlerConfigurer(context, registry)
        configurer.onApplicationEvent(ContextRefreshedEvent(context))

        assertThat(registry.getEntry(PROXIED_TASK_TYPE)).isNotNull()
        assertThat(registry.getType(ProxiedStubTaskPayload::class.java)).isEqualTo(PROXIED_TASK_TYPE)
        context.close()
    }

    private fun entry(schemaVersion: Int = 2): TaskHandlerEntry {
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
        )
    }

    private data class StubTaskPayload(
        override val uid: UUID,
        override val aggregateType: String,
        override val aggregateId: Long,
    ) : TaskPayload

    @Task(
        type = PROXIED_TASK_TYPE,
        schemaVersion = TaskHandlerRegistry.CURRENT_TASK_PAYLOAD_SCHEMA_VERSION,
        sensitivity = TaskPayloadSensitivity.INTERNAL,
    )
    data class ProxiedStubTaskPayload(
        override val uid: UUID,
        override val aggregateType: String,
        override val aggregateId: Long,
    ) : TaskPayload

    private class StubTaskHandler {
        fun handle(payload: TaskPayload) = Unit
    }

    open class ProxiedStubTaskHandler {
        @TaskHandler
        open fun handle(payload: ProxiedStubTaskPayload) = Unit
    }

    private companion object {
        const val TASK_TYPE = "test.registry"
        const val PROXIED_TASK_TYPE = "test.proxied.registry"
    }
}
