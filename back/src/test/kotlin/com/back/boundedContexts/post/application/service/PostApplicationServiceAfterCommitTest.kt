package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.postMixin.COMMENTS_COUNT
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.boundedContexts.post.event.PostCommentDeletedEvent
import com.back.boundedContexts.post.event.PostCommentModifiedEvent
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import com.back.boundedContexts.post.event.PostLikedEvent
import com.back.boundedContexts.post.event.PostModifiedEvent
import com.back.boundedContexts.post.event.PostUnlikedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.application.TaskFacade
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
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.ObjectMapper

@DisplayName("PostApplicationService 후속 작업 AFTER_COMMIT 테스트")
class PostApplicationServiceAfterCommitTest : BasePostApplicationServiceAfterCommitIntegrationTest() {
    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

    @Autowired
    private lateinit var postApplicationService: PostApplicationService

    @Autowired
    private lateinit var postAttrRepository: PostAttrRepositoryPort

    @Autowired
    private lateinit var taskRepository: TaskRepository

    @Autowired
    private lateinit var taskFacade: TaskFacade

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @Autowired
    private lateinit var transactionTemplate: TransactionTemplate

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
    @DisplayName("댓글 작성 트랜잭션이 rollback되면 이벤트·추천 후속 작업을 실행하지 않는다")
    fun writeCommentRollbackDoesNotRunSideEffects() {
        // given
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val post =
            transactionTemplate.execute {
                postApplicationService.write(
                    author = admin,
                    title = "comment rollback source",
                    content = "comment rollback content",
                    published = true,
                    listed = true,
                )
            }!!
        clearSideEffectMocks()

        // when
        transactionTemplate.executeWithoutResult { status ->
            val latestPost = postApplicationService.findById(post.id)!!
            postApplicationService.writeComment(
                author = admin,
                post = latestPost,
                content = "rollback comment",
            )
            status.setRollbackOnly()
        }

        // then
        verifyNoInteractions(
            postRecommendFeatureStoreService,
            eventPublisher,
        )
    }

    @Test
    @DisplayName("좋아요 트랜잭션이 rollback되면 이벤트·추천 후속 작업을 실행하지 않는다")
    fun likeRollbackDoesNotRunSideEffects() {
        // given
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val post =
            transactionTemplate.execute {
                postApplicationService.write(
                    author = admin,
                    title = "like rollback source",
                    content = "like rollback content",
                    published = true,
                    listed = true,
                )
            }!!
        clearSideEffectMocks()

        // when
        transactionTemplate.executeWithoutResult { status ->
            val latestPost = postApplicationService.findById(post.id)!!
            postApplicationService.like(latestPost, admin)
            status.setRollbackOnly()
        }

        // then
        verifyNoInteractions(
            postRecommendFeatureStoreService,
            eventPublisher,
        )
    }

    @Test
    @DisplayName("댓글 작성 commit은 이벤트·추천 후속 작업을 durable interaction task row로 남긴다")
    fun writeCommentCommitCreatesDurableInteractionSideEffectTask() {
        // given
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val post =
            transactionTemplate.execute {
                postApplicationService.write(
                    author = admin,
                    title = "comment durable source",
                    content = "comment durable content",
                    published = true,
                    listed = true,
                )
            }!!
        clearSideEffectMocks()
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()

        // when
        transactionTemplate.executeWithoutResult {
            val latestPost = postApplicationService.findById(post.id)!!
            postApplicationService.writeComment(
                author = admin,
                post = latestPost,
                content = "durable comment",
            )
        }

        // then
        val interactionTasks = postInteractionSideEffectTasksSince(previousTaskIds)
        assertThat(interactionTasks).hasSize(2)
        val eventTask = interactionTasks.single { task -> task.payload.contains("PostCommentWrittenEvent") }
        val refreshTask = interactionTasks.single { task -> task.payload.contains("\"recommendationAction\":\"REFRESH\"") }
        assertThat(eventTask.payload).contains(
            "\"postId\":${post.id}",
            "PostCommentWrittenEvent",
        )
        verifyNoInteractions(
            postRecommendFeatureStoreService,
            eventPublisher,
        )

        // when
        taskFacade.fire(postInteractionSideEffectPayload(eventTask))
        taskFacade.fire(postInteractionSideEffectPayload(refreshTask))

        // then
        assertThat(invokedMethodNames(postRecommendFeatureStoreService)).contains("refresh")
        assertThat(publishedEvents()).hasAtLeastOneElementOfType(PostCommentWrittenEvent::class.java)
    }

    @Test
    @DisplayName("좋아요 commit은 이벤트·추천 후속 작업을 durable interaction task row로 남긴다")
    fun likeCommitCreatesDurableInteractionSideEffectTask() {
        // given
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val post =
            transactionTemplate.execute {
                postApplicationService.write(
                    author = admin,
                    title = "like durable source",
                    content = "like durable content",
                    published = true,
                    listed = true,
                )
            }!!
        clearSideEffectMocks()
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()

        // when
        transactionTemplate.executeWithoutResult {
            val latestPost = postApplicationService.findById(post.id)!!
            postApplicationService.like(latestPost, admin)
        }

        // then
        val interactionTasks = postInteractionSideEffectTasksSince(previousTaskIds)
        assertThat(interactionTasks).hasSize(2)
        val eventTask = interactionTasks.single { task -> task.payload.contains("PostLikedEvent") }
        val refreshTask = interactionTasks.single { task -> task.payload.contains("\"recommendationAction\":\"REFRESH\"") }
        assertThat(eventTask.payload).contains(
            "\"postId\":${post.id}",
            "PostLikedEvent",
        )
        verifyNoInteractions(
            postRecommendFeatureStoreService,
            eventPublisher,
        )

        // when
        taskFacade.fire(postInteractionSideEffectPayload(eventTask))
        taskFacade.fire(postInteractionSideEffectPayload(refreshTask))

        // then
        assertThat(invokedMethodNames(postRecommendFeatureStoreService)).contains("refresh")
        assertThat(publishedEvents()).hasAtLeastOneElementOfType(PostLikedEvent::class.java)
    }

    @Test
    @DisplayName("댓글 수정 commit은 이벤트 후속 작업을 durable interaction task row로 남긴다")
    fun modifyCommentCommitCreatesDurableInteractionSideEffectTask() {
        // given
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val post =
            transactionTemplate.execute {
                postApplicationService.write(
                    author = admin,
                    title = "comment modify durable source",
                    content = "comment modify durable content",
                    published = true,
                    listed = true,
                )
            }!!
        val comment =
            transactionTemplate.execute {
                val latestPost = postApplicationService.findById(post.id)!!
                postApplicationService.writeComment(admin, latestPost, "before modify")
            }!!
        clearSideEffectMocks()
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()

        // when
        transactionTemplate.executeWithoutResult {
            postApplicationService.modifyComment(comment, admin, "after modify")
        }

        // then
        val interactionTasks = postInteractionSideEffectTasksSince(previousTaskIds)
        assertThat(interactionTasks).hasSize(1)
        assertThat(interactionTasks.single().payload).contains("PostCommentModifiedEvent")
        verifyNoInteractions(eventPublisher)

        // when
        taskFacade.fire(postInteractionSideEffectPayload(interactionTasks.single()))

        // then
        assertThat(publishedEvents()).hasAtLeastOneElementOfType(PostCommentModifiedEvent::class.java)
    }

    @Test
    @DisplayName("댓글 삭제 commit은 이벤트·추천 후속 작업을 durable interaction task row로 남긴다")
    fun deleteCommentCommitCreatesDurableInteractionSideEffectTask() {
        // given
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val post =
            transactionTemplate.execute {
                postApplicationService.write(
                    author = admin,
                    title = "comment delete durable source",
                    content = "comment delete durable content",
                    published = true,
                    listed = true,
                )
            }!!
        val comment =
            transactionTemplate.execute {
                val latestPost = postApplicationService.findById(post.id)!!
                postApplicationService.writeComment(admin, latestPost, "before delete")
            }!!
        clearSideEffectMocks()
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()

        // when
        transactionTemplate.executeWithoutResult {
            val latestPost = postApplicationService.findById(post.id)!!
            postApplicationService.deleteComment(latestPost, comment, admin)
        }

        // then
        val interactionTasks = postInteractionSideEffectTasksSince(previousTaskIds)
        assertThat(interactionTasks).hasSize(2)
        val eventTask = interactionTasks.single { task -> task.payload.contains("PostCommentDeletedEvent") }
        val refreshTask = interactionTasks.single { task -> task.payload.contains("\"recommendationAction\":\"REFRESH\"") }
        assertThat(eventTask.payload).contains("PostCommentDeletedEvent")
        verifyNoInteractions(
            postRecommendFeatureStoreService,
            eventPublisher,
        )

        // when
        taskFacade.fire(postInteractionSideEffectPayload(eventTask))
        taskFacade.fire(postInteractionSideEffectPayload(refreshTask))

        // then
        assertThat(invokedMethodNames(postRecommendFeatureStoreService)).contains("refresh")
        assertThat(publishedEvents()).hasAtLeastOneElementOfType(PostCommentDeletedEvent::class.java)
    }

    @Test
    @DisplayName("좋아요 취소 commit은 이벤트·추천 후속 작업을 durable interaction task row로 남긴다")
    fun unlikeCommitCreatesDurableInteractionSideEffectTask() {
        // given
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val post =
            transactionTemplate.execute {
                postApplicationService.write(
                    author = admin,
                    title = "unlike durable source",
                    content = "unlike durable content",
                    published = true,
                    listed = true,
                )
            }!!
        transactionTemplate.executeWithoutResult {
            val latestPost = postApplicationService.findById(post.id)!!
            postApplicationService.like(latestPost, admin)
        }
        clearSideEffectMocks()
        val previousTaskIds = taskRepository.findAll().map { it.id }.toSet()

        // when
        transactionTemplate.executeWithoutResult {
            val latestPost = postApplicationService.findById(post.id)!!
            postApplicationService.unlike(latestPost, admin)
        }

        // then
        val interactionTasks = postInteractionSideEffectTasksSince(previousTaskIds)
        assertThat(interactionTasks).hasSize(2)
        val eventTask = interactionTasks.single { task -> task.payload.contains("PostUnlikedEvent") }
        val refreshTask = interactionTasks.single { task -> task.payload.contains("\"recommendationAction\":\"REFRESH\"") }
        assertThat(eventTask.payload).contains("PostUnlikedEvent")
        verifyNoInteractions(
            postRecommendFeatureStoreService,
            eventPublisher,
        )

        // when
        taskFacade.fire(postInteractionSideEffectPayload(eventTask))
        taskFacade.fire(postInteractionSideEffectPayload(refreshTask))

        // then
        assertThat(invokedMethodNames(postRecommendFeatureStoreService)).contains("refresh")
        assertThat(publishedEvents()).hasAtLeastOneElementOfType(PostUnlikedEvent::class.java)
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
            )
        }
        val payload = singlePostWriteSideEffectPayloadSince(previousTaskIds)

        clearSideEffectMocks()

        // and when
        taskFacade.fire(payload)

        // then
        assertThat(invokedMethodNames(uploadedFileRetentionService)).contains("syncPostContent")
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
                )
            }!!

        // then
        val sideEffectTasks = postWriteSideEffectTasksSince(previousTaskIds)
        assertThat(sideEffectTasks).hasSize(1)
        val sideEffectTask = sideEffectTasks.single()
        assertThat(sideEffectTask.aggregateId).isEqualTo(post.id)
        assertThat(sideEffectTask.payload).contains("\"postId\":${post.id}")
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
            )
        }
        val payload = singlePostWriteSideEffectPayloadSince(previousTaskIds)

        // when
        assertThatThrownBy {
            taskFacade.fire(payload)
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("cache backend down")

        // then
        assertThat(invokedMethodNames(uploadedFileRetentionService)).contains("syncPostContent")
        assertThat(invokedMethodNames(postRecommendFeatureStoreService)).contains("refresh")
    }

    @Test
    @DisplayName("글 수정 후 추천 feature store 갱신은 기존 hit/like/comment 카운터를 유지한다")
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
                )
            }!!
        transactionTemplate.executeWithoutResult {
            postAttrRepository.incrementIntValue(post, HIT_COUNT, 11)
            postAttrRepository.incrementIntValue(post, LIKES_COUNT, 7)
            postAttrRepository.incrementIntValue(post, COMMENTS_COUNT, 3)
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
        taskFacade.fire(payload)

        // then
        assertThat(refreshedCounters).contains(
            PostCounterSnapshot(
                hitCount = 11,
                likesCount = 7,
                commentsCount = 3,
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
        taskFacade.fire(payload)

        // then
        assertThat(cacheLookupNames()).contains(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT)
        assertThat(publishedEvents()).hasAtLeastOneElementOfType(PostModifiedEvent::class.java)
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
        return objectMapper.readValue(sideEffectTasks.single().payload, PostWriteSideEffectPayload::class.java)
    }

    private fun postWriteSideEffectTasksSince(previousTaskIds: Set<Long>): List<Task> =
        taskRepository
            .findAll()
            .filter { task ->
                task.id !in previousTaskIds && task.taskType == PostWriteSideEffectPayload.TASK_TYPE
            }

    private fun postInteractionSideEffectTasksSince(previousTaskIds: Set<Long>): List<Task> =
        taskRepository
            .findAll()
            .filter { task ->
                task.id !in previousTaskIds && task.taskType == "post.interaction.side-effect"
            }

    private fun postInteractionSideEffectPayload(task: Task): PostInteractionSideEffectPayload =
        objectMapper.readValue(task.payload, PostInteractionSideEffectPayload::class.java)

    private fun recordActiveTransactionDuringSideEffects(sideEffectTransactions: MutableList<Boolean>) {
        doAnswer {
            sideEffectTransactions += TransactionSynchronizationManager.isActualTransactionActive()
            null
        }.`when`(uploadedFileRetentionService).syncPostContent(
            ArgumentMatchers.anyLong(),
            ArgumentMatchers.nullable(String::class.java),
            ArgumentMatchers.anyString(),
        )
    }

    private fun recordRefreshedCounters(refreshedCounters: MutableList<PostCounterSnapshot>) {
        doAnswer { invocation ->
            val post = invocation.getArgument<Post>(0)
            refreshedCounters +=
                PostCounterSnapshot(
                    hitCount = post.hitCount,
                    likesCount = post.likesCount,
                    commentsCount = post.commentsCount,
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
        val commentsCount: Int,
    )
}
