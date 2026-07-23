package com.back.global.task.application

import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import com.back.standard.dto.TaskPayload
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.data.domain.Pageable
import org.springframework.mock.env.MockEnvironment
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID

class TaskFacadeTest {
    @Test
    @DisplayName("addToQueue는 payload UID를 task UID로 고정한다")
    fun `add to queue uses payload uid as task uid`() {
        val repository = InMemoryTaskQueueRepository()
        val facade = createFacade(repository)
        val payloadUid = UUID.randomUUID()

        facade.addToQueue(StubTaskPayload(uid = payloadUid))

        assertThat(repository.savedTasks).singleElement().extracting<UUID> { it.uid }.isEqualTo(payloadUid)
    }

    @Test
    @DisplayName("addToQueue는 같은 payload UID 중복 insert를 idempotent success로 처리한다")
    fun `add to queue treats duplicate payload uid as idempotent success`() {
        val repository = InMemoryTaskQueueRepository(rejectDuplicateUid = true)
        val facade = createFacade(repository)
        val payload = StubTaskPayload(uid = UUID.randomUUID())

        facade.addToQueue(payload)

        assertThatCode {
            facade.addToQueue(payload)
        }.doesNotThrowAnyException()
        assertThat(repository.savedTasks).hasSize(1)
    }

    @Test
    @DisplayName("addToQueue는 중복 payload UID에서 inline handler를 재실행하지 않는다")
    fun `add to queue does not fire inline handler for duplicate payload uid`() {
        val repository = InMemoryTaskQueueRepository(rejectDuplicateUid = true)
        val handler = StubTaskHandler()
        val facade = createFacade(repository, handler, inlineWhenNotProd = true)
        val payload = StubTaskPayload(uid = UUID.randomUUID())

        facade.addToQueue(payload)
        facade.addToQueue(payload)

        assertThat(handler.handledPayloads).containsExactly(payload)
    }

    @Test
    @DisplayName("addToQueue는 호출자가 inline 실행을 비활성화할 수 있다")
    fun `add to queue can disable inline handler execution`() {
        val repository = InMemoryTaskQueueRepository()
        val handler = StubTaskHandler()
        val facade = createFacade(repository, handler, inlineWhenNotProd = true)
        val payload = StubTaskPayload(uid = UUID.randomUUID())

        facade.addToQueue(payload, inlineWhenEnabled = false)

        assertThat(repository.savedTasks).hasSize(1)
        assertThat(handler.handledPayloads).isEmpty()
    }

    @Test
    @DisplayName("fire는 handler 원본 예외를 그대로 전파한다")
    fun `fire unwraps handler exception`() {
        val repository = InMemoryTaskQueueRepository()
        val failure = RuntimeException("handler down")
        val facade = createFacade(repository, StubTaskHandler(failure = failure))

        assertThatThrownBy {
            facade.fire(StubTaskPayload(uid = UUID.randomUUID()))
        }.isSameAs(failure)
    }

    private fun createFacade(
        repository: InMemoryTaskQueueRepository,
        handler: StubTaskHandler = StubTaskHandler(),
        inlineWhenNotProd: Boolean = false,
    ): TaskFacade {
        val environment =
            MockEnvironment()
                .withProperty("custom.site.cookieDomain", "")
                .withProperty("custom.site.frontUrl", "http://localhost:3000")
                .withProperty("custom.site.backUrl", "http://localhost:8080")
        environment.setActiveProfiles("test")
        val objectMapper = ObjectMapper()

        val registry = TaskHandlerRegistry()
        registry.register(
            StubTaskPayload.TASK_TYPE,
            TaskHandlerEntry(
                taskType = StubTaskPayload.TASK_TYPE,
                payloadClass = StubTaskPayload::class.java,
                handlerMethod =
                    TaskHandlerMethod(
                        bean = handler,
                        method = StubTaskHandler::class.java.getDeclaredMethod("handle", StubTaskPayload::class.java),
                    ),
                retryPolicy = TaskRetryPolicy.fallback(StubTaskPayload.TASK_TYPE),
            ),
        )
        return TaskFacade(
            taskRepository = repository,
            taskHandlerRegistry = registry,
            objectMapper = objectMapper,
            environment = environment,
            inlineWhenNotProd = inlineWhenNotProd,
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

    private class StubTaskHandler(
        private val failure: RuntimeException? = null,
    ) {
        val handledPayloads = mutableListOf<StubTaskPayload>()

        fun handle(payload: StubTaskPayload) {
            failure?.let { throw it }
            handledPayloads += payload
        }
    }

    private class InMemoryTaskQueueRepository(
        private val rejectDuplicateUid: Boolean = false,
    ) : TaskQueueRepositoryPort {
        val savedTasks = mutableListOf<Task>()

        override fun save(task: Task): Task {
            if (rejectDuplicateUid && savedTasks.any { it.uid == task.uid && it !== task }) {
                throw DataIntegrityViolationException("duplicate task uid")
            }
            if (savedTasks.none { it === task }) {
                savedTasks += task
            }
            return task
        }

        override fun existsByUid(uid: UUID): Boolean = savedTasks.any { it.uid == uid }

        override fun countByStatus(status: TaskStatus): Long = unsupported()

        override fun countByStatusAndNextRetryAtLessThanEqual(
            status: TaskStatus,
            nextRetryAt: Instant,
        ): Long = unsupported()

        override fun countByStatusAndModifiedAtBefore(
            status: TaskStatus,
            modifiedAt: Instant,
        ): Long = unsupported()

        override fun countByTaskTypeAndStatus(
            taskType: String,
            status: TaskStatus,
        ): Long = unsupported()

        override fun countByTaskTypeAndStatusAndNextRetryAtLessThanEqual(
            taskType: String,
            status: TaskStatus,
            nextRetryAt: Instant,
        ): Long = unsupported()

        override fun countByTaskTypeAndStatusAndModifiedAtBefore(
            taskType: String,
            status: TaskStatus,
            modifiedAt: Instant,
        ): Long = unsupported()

        override fun findByStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
            status: TaskStatus,
            nextRetryAt: Instant,
            pageable: Pageable,
        ): List<Task> = unsupported()

        override fun findByStatusOrderByModifiedAtAsc(
            status: TaskStatus,
            pageable: Pageable,
        ): List<Task> = unsupported()

        override fun findByStatusOrderByModifiedAtDesc(
            status: TaskStatus,
            pageable: Pageable,
        ): List<Task> = unsupported()

        override fun findByStatusAndModifiedAtBeforeOrderByModifiedAtAsc(
            status: TaskStatus,
            modifiedAt: Instant,
            pageable: Pageable,
        ): List<Task> = unsupported()

        override fun findByTaskTypeAndStatusAndNextRetryAtLessThanEqualOrderByNextRetryAtAsc(
            taskType: String,
            status: TaskStatus,
            nextRetryAt: Instant,
            pageable: Pageable,
        ): List<Task> = unsupported()

        override fun findByTaskTypeAndStatusOrderByModifiedAtDesc(
            taskType: String,
            status: TaskStatus,
            pageable: Pageable,
        ): List<Task> = unsupported()

        private fun <T> unsupported(): T = throw UnsupportedOperationException("not needed in this test")
    }
}
