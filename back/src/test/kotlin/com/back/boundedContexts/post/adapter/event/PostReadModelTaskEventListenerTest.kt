package com.back.boundedContexts.post.adapter.event

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.application.service.PostReadPrewarmService
import com.back.boundedContexts.post.application.service.PostSearchEngineMirrorService
import com.back.boundedContexts.post.application.service.PostSearchIndexSyncService
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostReadPrewarmPayload
import com.back.boundedContexts.post.dto.PostSearchEngineMirrorPayload
import com.back.boundedContexts.post.dto.PostSearchIndexSyncPayload
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.global.task.application.TaskFacade
import com.back.global.task.application.TaskHandlerEntry
import com.back.global.task.application.TaskHandlerMethod
import com.back.global.task.application.TaskHandlerRegistry
import com.back.global.task.application.TaskRetryPolicy
import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.data.domain.Pageable
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID

class PostReadModelTaskEventListenerTest {
    @Test
    @DisplayName("같은 source event는 task type별 deterministic task UID를 enqueue한다")
    fun `same source event enqueues deterministic task uid per task type`() {
        val repository = RecordingTaskQueueRepository()
        val listener =
            createListener(
                taskFacade = TaskFacade(repository, createTaskHandlerRegistry(), ObjectMapper(), inlineWhenNotProd = false),
            )
        val event = postWrittenEvent(sourceEventUid = UUID.randomUUID())

        listener.handle(event)
        listener.handle(event)

        val firstDelivery = repository.savedTasks.take(3)
        val secondDelivery = repository.savedTasks.drop(3)
        assertThat(firstDelivery).hasSize(3)
        assertThat(secondDelivery).hasSize(3)
        assertThat(firstDelivery.map { it.taskType }).containsExactly(
            "post.search-index.sync",
            "post.search-engine.mirror",
            "post.read.prewarm",
        )
        assertThat(secondDelivery.map { it.taskType }).containsExactlyElementsOf(firstDelivery.map { it.taskType })
        assertThat(secondDelivery.map { it.uid }).containsExactlyElementsOf(firstDelivery.map { it.uid })
        assertThat(firstDelivery.map { it.uid }.toSet()).hasSize(3)
    }

    private fun createListener(taskFacade: TaskFacade): PostReadModelTaskEventListener =
        PostReadModelTaskEventListener(
            taskFacade = taskFacade,
            postSearchIndexSyncService = mock(PostSearchIndexSyncService::class.java),
            postSearchEngineMirrorService = mock(PostSearchEngineMirrorService::class.java),
            postReadPrewarmService = mock(PostReadPrewarmService::class.java),
            meterRegistry = null,
            asyncSearchIndexSyncEnabled = true,
            searchIndexMaxLagSeconds = 120,
            searchEngineMirrorEnabled = true,
            prewarmEnabled = true,
        )

    private fun createTaskHandlerRegistry(): TaskHandlerRegistry {
        val registry = TaskHandlerRegistry()
        val listener = createListener(taskFacade = mock(TaskFacade::class.java))
        registerPayload(registry, "post.search-index.sync", PostSearchIndexSyncPayload::class.java, listener)
        registerPayload(registry, "post.search-engine.mirror", PostSearchEngineMirrorPayload::class.java, listener)
        registerPayload(registry, "post.read.prewarm", PostReadPrewarmPayload::class.java, listener)
        return registry
    }

    private fun registerPayload(
        registry: TaskHandlerRegistry,
        taskType: String,
        payloadClass: Class<out com.back.standard.dto.TaskPayload>,
        listener: PostReadModelTaskEventListener,
    ) {
        registry.register(
            taskType,
            TaskHandlerEntry(
                taskType = taskType,
                payloadClass = payloadClass,
                handlerMethod =
                    TaskHandlerMethod(
                        bean = listener,
                        method = PostReadModelTaskEventListener::class.java.getDeclaredMethod("handle", payloadClass),
                    ),
                retryPolicy = TaskRetryPolicy.fallback(taskType),
            ),
        )
    }

    private fun postWrittenEvent(sourceEventUid: UUID): PostWrittenEvent =
        PostWrittenEvent(
            uid = sourceEventUid,
            postDto =
                PostDto(
                    id = 10L,
                    createdAt = Instant.EPOCH,
                    modifiedAt = Instant.EPOCH,
                    authorId = 1L,
                    authorName = "author",
                    authorUsername = "author",
                    authorProfileImgUrl = "",
                    title = "title",
                    summary = "summary",
                    version = 1L,
                    published = true,
                    listed = true,
                    likesCount = 0,
                    commentsCount = 0,
                    hitCount = 0,
                ),
            actorDto =
                MemberDto(
                    id = 1L,
                    createdAt = Instant.EPOCH,
                    modifiedAt = Instant.EPOCH,
                    isAdmin = false,
                    name = "author",
                    profileImageUrl = "",
                ),
            afterTags = listOf("kotlin", "spring"),
        )

    private class RecordingTaskQueueRepository : TaskQueueRepositoryPort {
        val savedTasks = mutableListOf<Task>()

        override fun save(task: Task): Task {
            savedTasks += task
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
