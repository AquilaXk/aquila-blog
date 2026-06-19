package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostCommentRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostWriteRequestIdempotencyRepositoryPort
import com.back.boundedContexts.post.application.port.output.SecureTipPort
import com.back.boundedContexts.post.domain.POSTS_COUNT
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.AdmDeletedPostSnapshotDto
import com.back.global.app.AppConfig
import com.back.global.event.application.EventPublisher
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.task.application.TaskFacade
import com.back.global.task.application.TaskHandlerEntry
import com.back.global.task.application.TaskHandlerMethod
import com.back.global.task.application.TaskHandlerRegistry
import com.back.global.task.application.TaskRetryPolicy
import com.back.global.task.application.port.output.TaskQueueRepositoryPort
import com.back.global.task.domain.Task
import com.back.global.task.domain.TaskStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.cache.CacheManager
import org.springframework.data.domain.Pageable
import org.springframework.mock.env.MockEnvironment
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionException
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.Optional
import java.util.UUID

@DisplayName("PostApplicationServiceDeleteResilience 테스트")
class PostApplicationServiceDeleteResilienceTest {
    init {
        AppConfig(
            siteBackUrl = "http://localhost:8080",
            siteFrontUrl = "http://localhost:3000",
            adminUsername = "admin",
            adminEmail = "admin@example.com",
            adminPassword = "password",
        )
    }

    private val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
    private val postAttrRepository: PostAttrRepositoryPort = mock(PostAttrRepositoryPort::class.java)
    private val memberAttrRepository: MemberAttrRepositoryPort = mock(MemberAttrRepositoryPort::class.java)
    private val postCommentRepository: PostCommentRepositoryPort = mock(PostCommentRepositoryPort::class.java)
    private val postLikeRepository: PostLikeRepositoryPort = mock(PostLikeRepositoryPort::class.java)
    private val postTagIndexRepository: PostTagIndexRepositoryPort = mock(PostTagIndexRepositoryPort::class.java)
    private val postWriteRequestIdempotencyRepository: PostWriteRequestIdempotencyRepositoryPort =
        mock(PostWriteRequestIdempotencyRepositoryPort::class.java)
    private val secureTipPort: SecureTipPort = mock(SecureTipPort::class.java)
    private val eventPublisher: EventPublisher = mock(EventPublisher::class.java)
    private val uploadedFileRetentionService: UploadedFileRetentionService = mock(UploadedFileRetentionService::class.java)
    private val cacheManager: CacheManager = mock(CacheManager::class.java)
    private val transactionManager: PlatformTransactionManager = NoopTransactionManager()
    private val postRecommendRankingService: PostRecommendRankingService = mock(PostRecommendRankingService::class.java)
    private val postRecommendFeatureStoreService: PostRecommendFeatureStoreService =
        mock(PostRecommendFeatureStoreService::class.java)
    private val postKeywordSearchPipelineService: PostKeywordSearchPipelineService =
        mock(PostKeywordSearchPipelineService::class.java)
    private val objectMapper = ObjectMapper()
    private val postReadCacheInvalidator = PostReadCacheInvalidator(cacheManager)
    private val postWriteSideEffectHandler =
        PostWriteSideEffectHandler(
            postReadCacheInvalidator = postReadCacheInvalidator,
            uploadedFileRetentionService = uploadedFileRetentionService,
            postRecommendFeatureStoreService = postRecommendFeatureStoreService,
            postRepository = postRepository,
            postAttrRepository = postAttrRepository,
            eventPublisher = eventPublisher,
            objectMapper = objectMapper,
            transactionManager = transactionManager,
        )
    private val taskRepository = RecordingTaskQueueRepository()
    private val taskFacade: TaskFacade =
        TaskFacade(
            taskRepository = taskRepository,
            taskHandlerRegistry = postWriteTaskHandlerRegistry(),
            objectMapper = objectMapper,
            environment = MockEnvironment().also { it.setActiveProfiles("test") },
            inlineWhenNotProd = false,
        )
    private val postHydrationService = PostHydrationService(postAttrRepository, memberAttrRepository)
    private val postCounterService =
        PostCounterService(
            postRepository = postRepository,
            postAttrRepository = postAttrRepository,
            memberAttrRepository = memberAttrRepository,
            postLikeRepository = postLikeRepository,
        )
    private val postTagIndexService =
        PostTagIndexService(
            postRepository = postRepository,
            postTagIndexRepository = postTagIndexRepository,
            postAttrRepository = postAttrRepository,
            tagsLocalCacheTtlSeconds = 180,
        )
    private val postTempDraftService = PostTempDraftService(postRepository, memberAttrRepository)
    private val postInteractionSideEffectQueue = PostInteractionSideEffectQueue(taskFacade)
    private val postCommentApplicationService =
        PostCommentApplicationService(
            postRepository = postRepository,
            postCommentRepository = postCommentRepository,
            postHydrationService = postHydrationService,
            postCounterService = postCounterService,
            postInteractionSideEffectQueue = postInteractionSideEffectQueue,
        )
    private val postLikeApplicationService =
        PostLikeApplicationService(
            postRepository = postRepository,
            postLikeRepository = postLikeRepository,
            postHydrationService = postHydrationService,
            postCounterService = postCounterService,
            postInteractionSideEffectQueue = postInteractionSideEffectQueue,
        )

    private val service =
        PostApplicationService(
            postRepository = postRepository,
            postWriteRequestIdempotencyRepository = postWriteRequestIdempotencyRepository,
            secureTipPort = secureTipPort,
            uploadedFileRetentionService = uploadedFileRetentionService,
            postRecommendRankingService = postRecommendRankingService,
            postKeywordSearchPipelineService = postKeywordSearchPipelineService,
            taskFacade = taskFacade,
            objectMapper = objectMapper,
            postHydrationService = postHydrationService,
            postCounterService = postCounterService,
            postTagIndexService = postTagIndexService,
            postTempDraftService = postTempDraftService,
            postCommentApplicationService = postCommentApplicationService,
            postLikeApplicationService = postLikeApplicationService,
        )

    @Test
    @DisplayName("delete는 member posts 카운터 보정 실패가 나도 soft delete를 완료한다")
    fun completeSoftDeleteWhenMemberPostsCounterRepairFails() {
        // given
        val author =
            Member(
                id = 1,
                username = "author",
                password = null,
                nickname = "작성자",
                email = null,
                apiKey = "author-api-key",
            )
        val actor =
            Member(
                id = 2,
                username = "admin",
                password = null,
                nickname = "관리자",
                email = null,
                apiKey = "admin-api-key",
            )
        val post =
            Post(
                id = 10,
                author = author,
                title = "삭제 대상",
                content = "본문",
                published = true,
                listed = true,
            )
        val now = Instant.now()
        author.createdAt = now
        author.modifiedAt = now
        actor.createdAt = now
        actor.modifiedAt = now
        post.createdAt = now
        post.modifiedAt = now

        given(memberAttrRepository.incrementIntValue(author, POSTS_COUNT, -1))
            .willThrow(RuntimeException("counter update failure"))
        given(postRepository.countByAuthor(author)).willThrow(RuntimeException("counter reconcile failure"))
        given(memberAttrRepository.findBySubjectAndName(author, POSTS_COUNT)).willReturn(null)
        given(postRepository.softDeleteById(post.id)).willReturn(true)

        // when & then
        assertDoesNotThrow {
            service.delete(post, actor)
        }

        // then
        then(postRepository).should().softDeleteById(post.id)
        then(memberAttrRepository).should().incrementIntValue(author, POSTS_COUNT, -1)
        then(postRepository).should().countByAuthor(author)
    }

    @Test
    @DisplayName("관리자 복구는 캐시와 추천 후속 작업을 commit 이후에 실행한다")
    fun runRestoreSideEffectsAfterCommit() {
        // given
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 21,
                title = "복구 대상",
                content = "복구 본문 #tag",
                authorId = 3,
                published = true,
                listed = true,
            )
        val restoredPost =
            Post(
                id = 21,
                author =
                    Member(
                        id = 3,
                        username = "restored-author",
                        password = null,
                        nickname = "복구작성자",
                        email = null,
                        apiKey = "restored-author-api-key",
                    ),
                title = "복구 대상",
                content = "복구 본문 #tag",
                published = true,
                listed = true,
            )
        given(postRepository.findDeletedSnapshotById(21)).willReturn(snapshot)
        given(postRepository.restoreDeletedById(21)).willReturn(true)
        given(postRepository.findById(21)).willReturn(Optional.of(restoredPost))

        // when
        service.restoreDeletedByIdForAdmin(21)
        val payload = capturePostWriteSideEffectPayload()

        // then
        verifyNoInteractions(cacheManager, postRecommendFeatureStoreService)

        // when
        postWriteSideEffectHandler.handle(payload)

        // then
        then(cacheManager).should().getCache(PostQueryCacheNames.FEED)
        then(postRecommendFeatureStoreService).should().refresh(restoredPost)
    }

    @Test
    @DisplayName("관리자 복구 후속 작업 UID는 같은 글 반복 복구에서도 충돌하지 않는다")
    fun createUniqueRestoreSideEffectTaskUidForRepeatedRestore() {
        // given
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 25,
                title = "반복 복구 대상",
                content = "반복 복구 본문 #tag",
                authorId = 3,
                published = true,
                listed = true,
            )
        val restoredPost =
            Post(
                id = 25,
                author =
                    Member(
                        id = 3,
                        username = "repeat-restore-author",
                        password = null,
                        nickname = "반복복구작성자",
                        email = null,
                        apiKey = "repeat-restore-author-api-key",
                    ),
                title = "반복 복구 대상",
                content = "반복 복구 본문 #tag",
                published = true,
                listed = true,
            )
        given(postRepository.findDeletedSnapshotById(25)).willReturn(snapshot)
        given(postRepository.restoreDeletedById(25)).willReturn(true)
        given(postRepository.findById(25)).willReturn(Optional.of(restoredPost))

        // when
        service.restoreDeletedByIdForAdmin(25)
        service.restoreDeletedByIdForAdmin(25)

        // then
        val payloads = capturePostWriteSideEffectPayloads()
        assertThat(payloads).hasSize(2)
        assertThat(payloads.map { it.uid }).doesNotHaveDuplicates()
    }

    @Test
    @DisplayName("관리자 영구삭제는 캐시와 첨부파일 정리와 추천 evict를 commit 이후에 실행한다")
    fun runHardDeleteSideEffectsAfterCommit() {
        // given
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 22,
                title = "영구삭제 대상",
                content = "영구삭제 본문 #tag",
                authorId = 4,
                published = true,
                listed = true,
            )
        given(postRepository.findDeletedSnapshotById(22)).willReturn(snapshot)
        given(postRepository.hardDeleteDeletedById(22)).willReturn(true)

        // when
        service.hardDeleteDeletedByIdForAdmin(22)
        val payload = capturePostWriteSideEffectPayload()

        // then
        verifyNoInteractions(cacheManager, uploadedFileRetentionService, postRecommendFeatureStoreService)

        // when
        postWriteSideEffectHandler.handle(payload)

        // then
        then(cacheManager).should().getCache(PostQueryCacheNames.FEED)
        then(uploadedFileRetentionService).should().scheduleDeletedPostAttachments(snapshot.content)
        then(postRecommendFeatureStoreService).should().evict(22)
    }

    @Test
    @DisplayName("관리자 비공개 글 영구삭제는 공개 읽기 캐시를 무효화하지 않는다")
    fun skipPublicReadCacheInvalidationForPrivateHardDelete() {
        // given
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 23,
                title = "비공개 영구삭제 대상",
                content = "비공개 영구삭제 본문 #tag",
                authorId = 4,
                published = false,
                listed = false,
            )
        given(postRepository.findDeletedSnapshotById(23)).willReturn(snapshot)
        given(postRepository.hardDeleteDeletedById(23)).willReturn(true)

        // when
        service.hardDeleteDeletedByIdForAdmin(23)
        val payload = capturePostWriteSideEffectPayload()

        postWriteSideEffectHandler.handle(payload)

        // then
        verifyNoInteractions(cacheManager)
        then(uploadedFileRetentionService).should().scheduleDeletedPostAttachments(snapshot.content)
        then(postRecommendFeatureStoreService).should().evict(23)
    }

    @ParameterizedTest
    @CsvSource(
        "true,false",
        "false,true",
    )
    @DisplayName("관리자 부분공개 상태 영구삭제는 공개 읽기 캐시를 무효화하지 않는다")
    fun skipPublicReadCacheInvalidationForPartiallyPublicHardDelete(
        published: Boolean,
        listed: Boolean,
    ) {
        // given
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 24,
                title = "부분공개 영구삭제 대상",
                content = "부분공개 영구삭제 본문 #tag",
                authorId = 4,
                published = published,
                listed = listed,
            )
        given(postRepository.findDeletedSnapshotById(24)).willReturn(snapshot)
        given(postRepository.hardDeleteDeletedById(24)).willReturn(true)

        // when
        service.hardDeleteDeletedByIdForAdmin(24)
        val payload = capturePostWriteSideEffectPayload()

        postWriteSideEffectHandler.handle(payload)

        // then
        verifyNoInteractions(cacheManager)
        then(uploadedFileRetentionService).should().scheduleDeletedPostAttachments(snapshot.content)
        then(postRecommendFeatureStoreService).should().evict(24)
    }

    private fun capturePostWriteSideEffectPayload(): PostWriteSideEffectPayload {
        val task = postWriteSideEffectTasks().single()
        return objectMapper.readValue(task.payload, PostWriteSideEffectPayload::class.java)
    }

    private fun capturePostWriteSideEffectPayloads(): List<PostWriteSideEffectPayload> =
        postWriteSideEffectTasks()
            .map { task -> objectMapper.readValue(task.payload, PostWriteSideEffectPayload::class.java) }

    private fun postWriteSideEffectTasks(): List<Task> =
        taskRepository.savedTasks.filter { it.taskType == PostWriteSideEffectPayload.TASK_TYPE }

    private fun postWriteTaskHandlerRegistry(): TaskHandlerRegistry {
        val registry = TaskHandlerRegistry()
        registry.register(
            PostWriteSideEffectPayload.TASK_TYPE,
            TaskHandlerEntry(
                taskType = PostWriteSideEffectPayload.TASK_TYPE,
                payloadClass = PostWriteSideEffectPayload::class.java,
                handlerMethod =
                    TaskHandlerMethod(
                        bean = postWriteSideEffectHandler,
                        method =
                            PostWriteSideEffectHandler::class.java.getDeclaredMethod(
                                "handle",
                                PostWriteSideEffectPayload::class.java,
                            ),
                    ),
                retryPolicy = TaskRetryPolicy.fallback(PostWriteSideEffectPayload.TASK_TYPE),
            ),
        )
        return registry
    }

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

    private class NoopTransactionManager : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()

        @Throws(TransactionException::class)
        override fun commit(status: TransactionStatus) = Unit

        @Throws(TransactionException::class)
        override fun rollback(status: TransactionStatus) = Unit
    }
}
