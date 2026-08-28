package com.back.boundedContexts.post.adapter.event

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.application.service.PostReadPrewarmService
import com.back.boundedContexts.post.application.service.PostSearchEngineMirrorService
import com.back.boundedContexts.post.application.service.PostSearchIndexSyncService
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostReadPrewarmPayload
import com.back.boundedContexts.post.dto.PostSearchEngineMirrorPayload
import com.back.boundedContexts.post.dto.PostSearchIndexSyncPayload
import com.back.boundedContexts.post.event.PostAccountDeletionDeletedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.global.task.application.TaskFacade
import com.back.global.task.application.TaskHandlerEntry
import com.back.global.task.application.TaskHandlerMethod
import com.back.global.task.application.TaskHandlerRegistry
import com.back.global.task.application.TaskPayloadEnvelope
import com.back.global.task.application.TaskPayloadEnvelopeCodec
import com.back.global.task.application.TaskRetryPolicy
import com.back.global.task.application.port.output.TaskQueueInsertPort
import com.back.global.task.application.port.output.TaskQueueInsertResult
import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.catchThrowable
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.springframework.data.domain.Pageable
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.time.Clock
import java.time.Instant
import java.util.UUID

class PostReadModelTaskEventListenerTest {
    @Test
    @DisplayName("같은 source event는 task type별 deterministic UID로 한 번만 enqueue한다")
    fun `same source event enqueues deterministic task uid per task type`() {
        val repository = RecordingTaskQueueRepository()
        val listener =
            createListener(
                taskFacade = createTaskFacade(repository),
            )
        val event = postWrittenEvent(sourceEventUid = UUID.randomUUID())

        listener.handle(event)
        listener.handle(event)

        assertThat(repository.savedTasks).hasSize(3)
        assertThat(repository.savedTasks.map { it.taskType }).containsExactly(
            "post.search-index.sync",
            "post.search-engine.mirror",
            "post.read.prewarm",
        )
        assertThat(repository.savedTasks.map { it.uid }.toSet()).hasSize(3)
    }

    @Test
    @DisplayName("read-model task enqueue 실패는 source task retry를 위해 전파한다")
    fun `enqueue failure propagates for source task retry`() {
        val repository = RecordingTaskQueueRepository(failOnSave = true)
        val listener =
            createListener(
                taskFacade = createTaskFacade(repository),
            )

        val thrown =
            catchThrowable {
                listener.handle(postWrittenEvent(sourceEventUid = UUID.randomUUID()))
            }

        assertThat(thrown)
            .isInstanceOf(RuntimeException::class.java)
            .hasMessage("enqueue down")
        assertThat(thrown.suppressed).hasSize(2)
    }

    @Test
    @DisplayName("계정 탈퇴 삭제 이벤트는 개인정보 DTO 없이 search/read-model 삭제 cleanup을 enqueue한다")
    fun `account deletion deleted event enqueues sanitized search cleanup`() {
        val repository = RecordingTaskQueueRepository()
        val listener =
            createListener(
                taskFacade = createTaskFacade(repository),
            )
        val event =
            PostAccountDeletionDeletedEvent(
                uid = UUID.randomUUID(),
                aggregateId = 91L,
                beforeTags = listOf("privacy", "retention"),
                afterTags = emptyList(),
            )

        listener.handle(event)

        assertThat(repository.savedTasks.map { it.taskType }).containsExactly(
            "post.search-index.sync",
            "post.search-engine.mirror",
        )
        val objectMapper = jacksonObjectMapper()
        val searchIndexEnvelope =
            objectMapper.readValue(repository.savedTasks[0].payload, TaskPayloadEnvelope::class.java)
        val mirrorEnvelope =
            objectMapper.readValue(repository.savedTasks[1].payload, TaskPayloadEnvelope::class.java)
        val searchIndexPayload =
            objectMapper.readValue(searchIndexEnvelope.payloadJson, PostSearchIndexSyncPayload::class.java)
        val mirrorPayload =
            objectMapper.readValue(mirrorEnvelope.payloadJson, PostSearchEngineMirrorPayload::class.java)
        assertThat(searchIndexPayload.postId).isEqualTo(91L)
        assertThat(searchIndexPayload.forceClear).isTrue()
        assertThat(mirrorPayload.postId).isEqualTo(91L)
        assertThat(mirrorPayload.deleted).isTrue()
        assertThat(mirrorPayload.tags).containsExactly("privacy", "retention")
        assertThat(repository.savedTasks.joinToString("\n") { it.payload })
            .doesNotContain("postDto")
            .doesNotContain("actorDto")
    }

    @Test
    @DisplayName("search index task는 legacy forceClear payload 값 대신 current post sync만 호출한다")
    fun `search index task ignores legacy force clear payload field`() {
        val searchIndexSyncService = mock(PostSearchIndexSyncService::class.java)
        val listener =
            createListener(
                taskFacade = mock(TaskFacade::class.java),
                postSearchIndexSyncService = searchIndexSyncService,
            )
        val payload =
            PostSearchIndexSyncPayload(
                uid = UUID.randomUUID(),
                aggregateType = "Post",
                aggregateId = 92L,
                postId = 92L,
                forceClear = true,
                enqueuedAtEpochMs = System.currentTimeMillis(),
            )

        listener.handle(payload)

        verify(searchIndexSyncService).sync(92L)
    }

    private fun createListener(
        taskFacade: TaskFacade,
        postSearchIndexSyncService: PostSearchIndexSyncService = mock(PostSearchIndexSyncService::class.java),
    ): PostReadModelTaskEventListener =
        PostReadModelTaskEventListener(
            taskFacade = taskFacade,
            postSearchIndexSyncService = postSearchIndexSyncService,
            postSearchEngineMirrorService = mock(PostSearchEngineMirrorService::class.java),
            postReadPrewarmService = mock(PostReadPrewarmService::class.java),
            meterRegistry = null,
            asyncSearchIndexSyncEnabled = true,
            searchIndexMaxLagSeconds = 120,
            searchEngineMirrorEnabled = true,
            prewarmEnabled = true,
        )

    private fun createTaskFacade(repository: RecordingTaskQueueRepository): TaskFacade {
        val objectMapper = jacksonObjectMapper()
        return TaskFacade(
            taskInsertPort = repository,
            taskHandlerRegistry = createTaskHandlerRegistry(),
            taskPayloadEnvelopeCodec = TaskPayloadEnvelopeCodec(objectMapper, Clock.systemUTC()),
        )
    }

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
            TaskHandlerEntry.withExactDecoders(
                taskType = taskType,
                payloadClass = payloadClass,
                handlerMethod =
                    TaskHandlerMethod(
                        bean = listener,
                        method = PostReadModelTaskEventListener::class.java.getDeclaredMethod("handle", payloadClass),
                    ),
                retryPolicy = TaskRetryPolicy(taskType, 5, 10, 2.0, 300),
                schemaVersion = 2,
                sensitivity = TaskPayloadSensitivity.PUBLIC,
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

    private class RecordingTaskQueueRepository(
        private val failOnSave: Boolean = false,
    ) : TaskQueueRepositoryPort,
        TaskQueueInsertPort {
        val savedTasks = mutableListOf<Task>()

        override fun insertIfAbsent(task: Task): TaskQueueInsertResult {
            if (failOnSave) throw RuntimeException("enqueue down")
            if (savedTasks.any { it.uid == task.uid }) return TaskQueueInsertResult.DUPLICATE
            savedTasks += task
            return TaskQueueInsertResult.INSERTED
        }

        override fun save(task: Task): Task {
            if (failOnSave) throw RuntimeException("enqueue down")
            savedTasks += task
            return task
        }

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
