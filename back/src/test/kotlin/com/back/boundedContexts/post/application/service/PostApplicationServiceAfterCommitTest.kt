package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.postMixin.COMMENTS_COUNT
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.support.BasePostApplicationServiceAfterCommitIntegrationTest
import org.assertj.core.api.Assertions.assertThat
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

@DisplayName("PostApplicationService 후속 작업 AFTER_COMMIT 테스트")
class PostApplicationServiceAfterCommitTest : BasePostApplicationServiceAfterCommitIntegrationTest() {
    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

    @Autowired
    private lateinit var postApplicationService: PostApplicationService

    @Autowired
    private lateinit var postAttrRepository: PostAttrRepositoryPort

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
            cacheManager,
        )
    }

    @Test
    @DisplayName("글 작성 트랜잭션이 commit되면 첨부파일·추천 후속 작업을 실행한다")
    fun writeCommitRunsSideEffects() {
        // given
        clearSideEffectMocks()
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
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

        // then
        assertThat(invokedMethodNames(uploadedFileRetentionService)).contains("syncPostContent")
        assertThat(invokedMethodNames(postRecommendFeatureStoreService)).contains("refresh")
        assertThat(sideEffectTransactions).containsOnly(true)
    }

    @Test
    @DisplayName("커밋 후 캐시 축출 실패는 첨부파일·추천 후속 작업을 막지 않는다")
    fun writeCommitContinuesSideEffectsWhenCacheEvictionFails() {
        // given
        clearSideEffectMocks()
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
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

        // then
        assertThat(refreshedCounters).contains(
            PostCounterSnapshot(
                hitCount = 11,
                likesCount = 7,
                commentsCount = 3,
            ),
        )
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
