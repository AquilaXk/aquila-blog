package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.adapter.persistence.PostRepository
import com.back.boundedContexts.post.adapter.persistence.PostWriteRequestIdempotencyRepository
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.boundedContexts.post.event.PostModifiedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.application.TaskPayloadEnvelope
import com.back.global.task.model.Task
import com.back.support.BasePostApplicationServiceAfterCommitIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers
import org.mockito.Mockito.clearInvocations
import org.mockito.Mockito.doAnswer
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mockingDetails
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.ObjectMapper
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@DisplayName("PostApplicationService 후속 작업 AFTER_COMMIT 테스트")
class PostApplicationServiceAfterCommitTest : BasePostApplicationServiceAfterCommitIntegrationTest() {
    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

    @Autowired
    private lateinit var postApplicationService: PostApplicationService

    @Autowired
    private lateinit var postAttrRepository: PostAttrRepositoryPort

    @Autowired
    private lateinit var postRepository: PostRepository

    @Autowired
    private lateinit var postWriteRequestIdempotencyRepository: PostWriteRequestIdempotencyRepository

    @Autowired
    private lateinit var taskRepository: TaskRepository

    @Autowired
    private lateinit var postWriteSideEffectHandler: PostWriteSideEffectHandler

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @Autowired
    private lateinit var transactionTemplate: TransactionTemplate

    @Autowired
    private lateinit var transactionManager: PlatformTransactionManager

    @Test
    @DisplayName("동일 작성자와 멱등 키의 동시 글 작성은 하나의 글·slot·후속 작업만 남긴다")
    fun concurrentIdempotentWritesPersistOnePostSlotAndTask() {
        // given
        val author = actorApplicationService.findByEmail("admin@test.com")!!
        val requestKey = "concurrent-write-${System.nanoTime()}"
        val postsBefore = postRepository.countByAuthor(author)
        val totalPostsBefore = postRepository.count()
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val requiredTransactionTemplate =
            TransactionTemplate(transactionManager).apply {
                propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRED
            }
        val executor = Executors.newFixedThreadPool(2)

        val results =
            try {
                val futures =
                    List(2) {
                        executor.submit<ConcurrentWriteResult> {
                            ready.countDown()
                            check(start.await(10, TimeUnit.SECONDS)) { "concurrent idempotent write start timed out" }
                            requireNotNull(
                                requiredTransactionTemplate.execute {
                                    val post =
                                        postApplicationService.write(
                                            author = author,
                                            title = "concurrent idempotent source",
                                            content = "concurrent idempotent content",
                                            idempotencyKey = requestKey,
                                            summaryMode = PostSummaryMode.AUTO,
                                        )
                                    // 재시도 요청도 같은 REQUIRED 트랜잭션 안에서 계속 조회할 수 있어야 한다.
                                    ConcurrentWriteResult(post.id, postApplicationService.count())
                                },
                            )
                        }
                    }

                assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue()
                start.countDown()
                futures.map { it.get(20, TimeUnit.SECONDS) }
            } finally {
                start.countDown()
                executor.shutdownNow()
                assertThat(executor.awaitTermination(10, TimeUnit.SECONDS)).isTrue()
            }

        // then
        assertThat(results.map { it.postId }.distinct()).hasSize(1)
        assertThat(results.map { it.postCountAfterWrite }).containsOnly(totalPostsBefore + 1)
        assertThat(postRepository.countByAuthor(author)).isEqualTo(postsBefore + 1)
        val requestSlot = postWriteRequestIdempotencyRepository.findByActorAndRequestKey(author, requestKey)
        assertThat(requestSlot).isNotNull()
        assertThat(requestSlot!!.postId).isEqualTo(results.first().postId)
        assertThat(postWriteSideEffectTasksSince(previousTaskIds)).hasSize(1)
    }

    @Test
    @DisplayName("글 작성 트랜잭션이 rollback되면 첨부파일·추천 후속 작업을 실행하지 않는다")
    fun writeRollbackDoesNotRunSideEffects() {
        // given
        clearSideEffectMocks()
        val admin = actorApplicationService.findByEmail("admin@test.com")!!

        // when
        transactionTemplate.executeWithoutResult { status ->
            postApplicationService.write(
                author = admin,
                title = "rollback after commit guard",
                content = "rollback content",
                published = true,
                listed = true,
                summaryMode = PostSummaryMode.AUTO,
            )
            status.setRollbackOnly()
        }

        // then
        verifyNoInteractions(
            uploadedFileRetentionService,
            postRecommendFeatureStoreService,
            eventPublisher,
            cacheManager,
        )
    }

    @Test
    @DisplayName("공개 글 조회수 증가 commit은 전용 hit 후속 작업만 durable task row로 남긴다")
    fun incrementHitCommitCreatesDedicatedHitSideEffectTask() {
        // given
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val post =
            transactionTemplate.execute {
                postApplicationService.write(
                    author = admin,
                    title = "hit durable source",
                    content = "hit durable content",
                    published = true,
                    listed = true,
                    summaryMode = PostSummaryMode.AUTO,
                )
            }!!
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()

        // when
        transactionTemplate.executeWithoutResult {
            postApplicationService.incrementHit(postApplicationService.findById(post.id)!!)
        }

        // then
        val newTasks = taskRepository.findAll().filter { it.id !in previousTaskIds }
        assertThat(newTasks).hasSize(1)
        assertThat(newTasks).allSatisfy { task ->
            assertThat(task.taskType).isEqualTo("post.hit.side-effect")
            assertThat(task.aggregateType).isEqualTo("Post")
            assertThat(task.aggregateId).isEqualTo(post.id)
        }
        assertThat(newTasks.count { it.taskType == "post.interaction.side-effect" }).isZero()

        val envelope = objectMapper.readValue(newTasks.single().payload, TaskPayloadEnvelope::class.java)
        val payload = objectMapper.readTree(envelope.payloadJson)
        assertThat(envelope.taskType).isEqualTo("post.hit.side-effect")
        assertThat(payload.path("postId").longValue()).isEqualTo(post.id)
        assertThat(payload.path("aggregateType").textValue()).isEqualTo("Post")
        assertThat(payload.path("aggregateId").longValue()).isEqualTo(post.id)
        assertThat(payload.path("reason").textValue()).isEqualTo("hit")
    }

    @Test
    @DisplayName("글 작성 트랜잭션이 commit되면 durable task 실행으로 첨부파일·추천 후속 작업을 처리한다")
    fun writeCommitRunsSideEffects() {
        // given
        clearSideEffectMocks()
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()
        val sideEffectTransactions = mutableListOf<Boolean>()
        recordActiveTransactionDuringSideEffects(sideEffectTransactions)

        // when
        transactionTemplate.executeWithoutResult {
            postApplicationService.write(
                author = admin,
                title = "commit after commit guard",
                content = "commit content",
                published = true,
                listed = true,
                summaryMode = PostSummaryMode.AUTO,
            )
        }
        val payload = singlePostWriteSideEffectPayloadSince(previousTaskIds)

        clearSideEffectMocks()

        // and when
        postWriteSideEffectHandler.handle(payload)

        // then
        assertThat(invokedMethodNames(uploadedFileRetentionService)).contains("syncPostAttachmentKeys")
        assertThat(invokedMethodNames(postRecommendFeatureStoreService)).contains("refresh")
        assertThat(sideEffectTransactions).containsOnly(true)
        assertThat(publishedEvents()).hasAtLeastOneElementOfType(PostWrittenEvent::class.java)
    }

    @Test
    @DisplayName("글 작성 commit은 후속 작업을 durable task row로 남긴다")
    fun writeCommitCreatesDurablePostWriteSideEffectTask() {
        // given
        clearSideEffectMocks()
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()

        // when
        val post =
            transactionTemplate.execute {
                postApplicationService.write(
                    author = admin,
                    title = "durable side effect source",
                    content = "durable side effect content",
                    published = true,
                    listed = true,
                    summaryMode = PostSummaryMode.AUTO,
                )
            }!!

        // then
        val sideEffectTasks = postWriteSideEffectTasksSince(previousTaskIds)
        assertThat(sideEffectTasks).hasSize(1)
        val sideEffectTask = sideEffectTasks.single()
        assertThat(sideEffectTask.aggregateId).isEqualTo(post.id)
        assertThat(postWriteSideEffectPayload(sideEffectTask).postId).isEqualTo(post.id)
    }

    @Test
    @DisplayName("durable task 실행 중 캐시 축출 실패는 첨부파일·추천 후속 작업 이후 retry로 전파된다")
    fun writeCommitContinuesSideEffectsWhenCacheEvictionFails() {
        // given
        clearSideEffectMocks()
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()
        doThrow(RuntimeException("cache backend down"))
            .`when`(cacheManager)
            .getCache(PostQueryCacheNames.FEED)

        // when
        transactionTemplate.executeWithoutResult {
            postApplicationService.write(
                author = admin,
                title = "cache failure after commit guard",
                content = "cache failure content",
                published = true,
                listed = true,
                summaryMode = PostSummaryMode.AUTO,
            )
        }
        val payload = singlePostWriteSideEffectPayloadSince(previousTaskIds)

        // when
        assertThatThrownBy {
            postWriteSideEffectHandler.handle(payload)
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("cache backend down")

        // then
        assertThat(invokedMethodNames(uploadedFileRetentionService)).contains("syncPostAttachmentKeys")
        assertThat(invokedMethodNames(postRecommendFeatureStoreService)).contains("refresh")
    }

    @Test
    @DisplayName("글 수정 후 추천 feature store 갱신은 기존 hit/like 카운터를 유지한다")
    fun modifyCommitRefreshesRecommendFeatureStoreWithHydratedCounters() {
        // given
        clearSideEffectMocks()
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val post =
            transactionTemplate.execute {
                postApplicationService.write(
                    author = admin,
                    title = "recommend counter source",
                    content = "recommend counter content",
                    published = true,
                    listed = true,
                    summaryMode = PostSummaryMode.AUTO,
                )
            }!!
        transactionTemplate.executeWithoutResult {
            postAttrRepository.incrementIntValue(post, HIT_COUNT, 11)
            postAttrRepository.incrementIntValue(post, LIKES_COUNT, 7)
        }
        val refreshedCounters = mutableListOf<PostCounterSnapshot>()
        clearSideEffectMocks()
        recordRefreshedCounters(refreshedCounters)
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()

        // when
        transactionTemplate.executeWithoutResult {
            val latestPost = postApplicationService.findById(post.id)!!
            postApplicationService.modify(
                actor = admin,
                post = latestPost,
                title = "recommend counter source modified",
                content = "recommend counter content modified",
                published = true,
                listed = true,
                expectedVersion = latestPost.version ?: 0L,
            )
        }
        val payload = singlePostWriteSideEffectPayloadSince(previousTaskIds)

        // and when
        postWriteSideEffectHandler.handle(payload)

        // then
        assertThat(refreshedCounters).contains(
            PostCounterSnapshot(
                hitCount = 11,
                likesCount = 7,
            ),
        )
        assertThat(publishedEvents()).hasAtLeastOneElementOfType(PostModifiedEvent::class.java)
    }

    @Test
    @DisplayName("contentHtml만 바뀐 공개 글 수정도 상세 캐시를 commit 이후 무효화한다")
    fun modifyContentHtmlOnlyEvictsPublicDetailCachesAfterCommit() {
        // given
        clearSideEffectMocks()
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val post =
            transactionTemplate.execute {
                postApplicationService.write(
                    author = admin,
                    title = "content html cache source",
                    content = "same markdown content",
                    published = true,
                    listed = true,
                    summaryMode = PostSummaryMode.AUTO,
                )
            }!!
        clearSideEffectMocks()
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()

        // when
        transactionTemplate.executeWithoutResult {
            val latestPost = postApplicationService.findById(post.id)!!
            postApplicationService.modify(
                actor = admin,
                post = latestPost,
                title = latestPost.title,
                content = latestPost.content,
                published = true,
                listed = true,
                expectedVersion = latestPost.version ?: 0L,
                contentHtml = "<p>rendered html only</p>",
            )
        }
        val payload = singlePostWriteSideEffectPayloadSince(previousTaskIds)

        // and when
        postWriteSideEffectHandler.handle(payload)

        // then
        assertThat(cacheLookupNames()).contains(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT)
        assertThat(publishedEvents()).hasAtLeastOneElementOfType(PostModifiedEvent::class.java)
    }

    @Test
    @DisplayName("비공개 글 summary 수정은 관리자 목록 캐시만 무효화한다")
    fun modifyPrivateSummaryEvictsAdminPostListOnly() {
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val post =
            transactionTemplate.execute {
                postApplicationService.write(
                    author = admin,
                    title = "private summary source",
                    content = "private summary content",
                    published = false,
                    listed = false,
                    summaryMode = PostSummaryMode.AUTO,
                )
            }!!
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()

        transactionTemplate.executeWithoutResult {
            val latestPost = postApplicationService.findById(post.id)!!
            postApplicationService.modify(
                actor = admin,
                post = latestPost,
                title = latestPost.title,
                content = latestPost.content,
                published = false,
                listed = false,
                expectedVersion = latestPost.version ?: 0L,
                summary = "private manual summary",
                summaryMode = PostSummaryMode.MANUAL,
            )
        }

        assertThat(singlePostWriteSideEffectPayloadSince(previousTaskIds).cacheInvalidationTargets)
            .containsExactly(PostReadCacheInvalidationTarget.ADMIN_POSTS_FIRST_PAGE)
    }

    @Test
    @DisplayName("링크 공개 변경은 관리자 목록과 상세 캐시를 함께 무효화한다")
    fun unlistedChangesEvictDetailAfterCommit() {
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        for ((beforePublished, afterPublished) in listOf(true to false, false to true, true to true)) {
            val post =
                transactionTemplate.execute {
                    postApplicationService.write(
                        author = admin,
                        title = "unlisted cache source",
                        content = "original content",
                        published = beforePublished,
                        listed = false,
                        summaryMode = PostSummaryMode.AUTO,
                    )
                }!!
            clearSideEffectMocks()
            val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()
            transactionTemplate.executeWithoutResult {
                val latest = postApplicationService.findById(post.id)!!
                postApplicationService.modify(
                    actor = admin,
                    post = latest,
                    title = latest.title,
                    content = "updated content",
                    published = afterPublished,
                    listed = false,
                    expectedVersion = latest.version ?: 0L,
                )
            }
            val payload = singlePostWriteSideEffectPayloadSince(previousTaskIds)
            assertThat(payload.cacheInvalidationTargets).containsExactlyInAnyOrder(
                PostReadCacheInvalidationTarget.ADMIN_POSTS_FIRST_PAGE,
                PostReadCacheInvalidationTarget.DETAIL,
            )
            postWriteSideEffectHandler.handle(payload)
            assertThat(cacheLookupNames()).contains(
                PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT,
                PostQueryCacheNames.DETAIL_PUBLIC_META,
                PostQueryCacheNames.DETAIL_PUBLIC_CONTENT,
                PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE,
            )
        }
    }

    @Test
    @DisplayName("관리자 글 복구와 영구삭제는 commit 후 도메인 이벤트를 발행한다")
    fun restoreAndHardDeletePublishDomainEventsAfterCommit() {
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val post =
            transactionTemplate.execute {
                postApplicationService.write(
                    author = admin,
                    title = "admin restore and hard delete event source",
                    content = "tags: [kotlin]\n\nrestore and hard delete content",
                    published = true,
                    listed = true,
                    summaryMode = PostSummaryMode.AUTO,
                )
            }!!
        transactionTemplate.executeWithoutResult {
            postApplicationService.delete(postApplicationService.findById(post.id)!!, admin)
        }

        clearSideEffectMocks()
        val restorePrevTaskIds = taskRepository.findAll().map { it.id }.toSet()
        transactionTemplate.executeWithoutResult {
            postApplicationService.restoreDeletedByIdForAdmin(post.id)
        }
        val restorePayload = singlePostWriteSideEffectPayloadSince(restorePrevTaskIds)
        postWriteSideEffectHandler.handle(restorePayload)

        assertThat(publishedEvents())
            .filteredOn { it is PostModifiedEvent && it.aggregateId == post.id }
            .isNotEmpty()

        transactionTemplate.executeWithoutResult {
            postApplicationService.delete(postApplicationService.findById(post.id)!!, admin)
        }

        clearSideEffectMocks()
        val hardDeletePrevTaskIds = taskRepository.findAll().map { it.id }.toSet()
        transactionTemplate.executeWithoutResult {
            postApplicationService.hardDeleteDeletedByIdForAdmin(post.id)
        }
        val hardDeletePayload = singlePostWriteSideEffectPayloadSince(hardDeletePrevTaskIds)
        postWriteSideEffectHandler.handle(hardDeletePayload)

        assertThat(publishedEvents())
            .filteredOn { it is com.back.boundedContexts.post.event.PostDeletedEvent && it.aggregateId == post.id }
            .isNotEmpty()
    }

    private fun clearSideEffectMocks() {
        clearInvocations(
            uploadedFileRetentionService,
            postRecommendFeatureStoreService,
            eventPublisher,
            cacheManager,
        )
    }

    private fun invokedMethodNames(mock: Any): List<String> = mockingDetails(mock).invocations.map { it.method.name }

    private fun cacheLookupNames(): List<String> =
        mockingDetails(cacheManager)
            .invocations
            .filter { it.method.name == "getCache" }
            .mapNotNull { it.arguments.firstOrNull() as? String }

    private fun publishedEvents(): List<Any?> =
        mockingDetails(eventPublisher)
            .invocations
            .filter { it.method.name == "publish" }
            .map { it.arguments.firstOrNull() }

    private fun singlePostWriteSideEffectPayloadSince(previousTaskIds: Set<Long>): PostWriteSideEffectPayload {
        val sideEffectTasks = postWriteSideEffectTasksSince(previousTaskIds)
        assertThat(sideEffectTasks).hasSize(1)
        return postWriteSideEffectPayload(sideEffectTasks.single())
    }

    private fun postWriteSideEffectPayload(task: Task): PostWriteSideEffectPayload {
        val envelope = objectMapper.readValue(task.payload, TaskPayloadEnvelope::class.java)
        return objectMapper.readValue(envelope.payloadJson, PostWriteSideEffectPayload::class.java)
    }

    private fun postWriteSideEffectTasksSince(previousTaskIds: Set<Long>): List<Task> =
        taskRepository
            .findAll()
            .filter { task ->
                task.id !in previousTaskIds && task.taskType == PostWriteSideEffectPayload.TASK_TYPE
            }

    private fun recordActiveTransactionDuringSideEffects(sideEffectTransactions: MutableList<Boolean>) {
        doAnswer {
            sideEffectTransactions += TransactionSynchronizationManager.isActualTransactionActive()
            null
        }.`when`(uploadedFileRetentionService).syncPostAttachmentKeys(
            ArgumentMatchers.anyLong(),
            ArgumentMatchers.anyCollection(),
            ArgumentMatchers.anyCollection(),
            ArgumentMatchers.anyCollection(),
            ArgumentMatchers.anyCollection(),
        )
    }

    private fun recordRefreshedCounters(refreshedCounters: MutableList<PostCounterSnapshot>) {
        doAnswer { invocation ->
            val post = invocation.getArgument<Post>(0)
            refreshedCounters +=
                PostCounterSnapshot(
                    hitCount = post.hitCount,
                    likesCount = post.likesCount,
                )
            null
        }.`when`(postRecommendFeatureStoreService).refresh(anyPost())
    }

    private fun anyPost(): Post =
        ArgumentMatchers.any(Post::class.java)
            ?: Post(
                author = Member(id = 0, username = "dummy", nickname = "dummy", apiKey = "dummy"),
                title = "dummy",
                content = "dummy",
            )

    private data class PostCounterSnapshot(
        val hitCount: Int,
        val likesCount: Int,
    )

    private data class ConcurrentWriteResult(
        val postId: Long,
        val postCountAfterWrite: Long,
    )
}
