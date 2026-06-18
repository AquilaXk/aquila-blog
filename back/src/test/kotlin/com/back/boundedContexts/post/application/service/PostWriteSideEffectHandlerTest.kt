package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.postMixin.COMMENTS_COUNT
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.global.event.application.EventPublisher
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.standard.dto.EventPayload
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow
import org.mockito.ArgumentMatchers
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.cache.concurrent.ConcurrentMapCacheManager
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionException
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener
import org.springframework.transaction.support.SimpleTransactionStatus
import java.util.Optional

@DisplayName("PostWriteSideEffectHandler 테스트")
class PostWriteSideEffectHandlerTest {
    private val uploadedFileRetentionService: UploadedFileRetentionService =
        mock(UploadedFileRetentionService::class.java)
    private val postRecommendFeatureStoreService: PostRecommendFeatureStoreService =
        mock(PostRecommendFeatureStoreService::class.java)
    private val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
    private val postAttrRepository: PostAttrRepositoryPort = mock(PostAttrRepositoryPort::class.java)
    private val eventPublisher: EventPublisher = mock(EventPublisher::class.java)
    private val handler =
        PostWriteSideEffectHandler(
            postReadCacheInvalidator = PostReadCacheInvalidator(ConcurrentMapCacheManager()),
            uploadedFileRetentionService = uploadedFileRetentionService,
            postRecommendFeatureStoreService = postRecommendFeatureStoreService,
            postRepository = postRepository,
            postAttrRepository = postAttrRepository,
            eventPublisher = eventPublisher,
            transactionManager = NoopTransactionManager(),
        )

    @Test
    @DisplayName("첨부파일 동기화 실패는 후속 작업 handler 밖으로 전파하지 않는다")
    fun continueWhenAttachmentSyncFails() {
        // given
        doThrow(RuntimeException("storage down"))
            .`when`(uploadedFileRetentionService)
            .syncPostContent(10L, "before", "after")

        // when & then
        assertDoesNotThrow {
            handler.handle(
                PostWriteAfterCommitEvent(
                    command =
                        sideEffectCommand(
                            postId = 10L,
                            previousContent = "before",
                            currentContent = "after",
                            recommendationAction = PostRecommendationSideEffect.EVICT,
                        ),
                    domainEvent = null,
                ),
            )
        }
        verify(postRecommendFeatureStoreService).evict(10L)
    }

    @Test
    @DisplayName("추천 feature store evict 실패는 후속 작업 handler 밖으로 전파하지 않는다")
    fun continueWhenRecommendationEvictFails() {
        // given
        doThrow(RuntimeException("recommendation cache down"))
            .`when`(postRecommendFeatureStoreService)
            .evict(12L)

        // when & then
        assertDoesNotThrow {
            handler.handle(
                PostWriteAfterCommitEvent(
                    command =
                        sideEffectCommand(
                            postId = 12L,
                            recommendationAction = PostRecommendationSideEffect.EVICT,
                        ),
                    domainEvent = null,
                ),
            )
        }
    }

    @Test
    @DisplayName("후속 작업 handler는 Spring transaction commit 이후 이벤트로만 호출된다")
    fun handlePostWriteEventAfterCommit() {
        // when
        val handlerMethod =
            PostWriteSideEffectHandler::class.java
                .declaredMethods
                .single { method ->
                    method.parameterTypes.contentEquals(arrayOf(PostWriteAfterCommitEvent::class.java))
                }
        val annotation = handlerMethod.getAnnotation(TransactionalEventListener::class.java)

        // then
        assertThat(annotation.phase).isEqualTo(TransactionPhase.AFTER_COMMIT)
        assertThat(annotation.fallbackExecution).isTrue()
    }

    @Test
    @DisplayName("외부 post write 이벤트는 후속 작업 이후에 발행한다")
    fun publishDomainEventAfterSideEffects() {
        // given
        val domainEvent = mock(EventPayload::class.java)

        // when
        handler.handle(
            PostWriteAfterCommitEvent(
                command =
                    sideEffectCommand(
                        postId = 14L,
                        recommendationAction = PostRecommendationSideEffect.EVICT,
                    ),
                domainEvent = domainEvent,
            ),
        )

        // then
        verify(postRecommendFeatureStoreService).evict(14L)
        verify(eventPublisher).publish(domainEvent)
    }

    @Test
    @DisplayName("외부 post write 이벤트 발행 실패는 후속 작업 handler 밖으로 전파하지 않는다")
    fun continueWhenDomainEventPublishFails() {
        // given
        val domainEvent = mock(EventPayload::class.java)
        doThrow(RuntimeException("event bus down"))
            .`when`(eventPublisher)
            .publish(domainEvent)

        // when & then
        assertDoesNotThrow {
            handler.handle(
                PostWriteAfterCommitEvent(
                    command =
                        sideEffectCommand(
                            postId = 15L,
                            recommendationAction = PostRecommendationSideEffect.EVICT,
                        ),
                    domainEvent = domainEvent,
                ),
            )
        }
        verify(postRecommendFeatureStoreService).evict(15L)
    }

    @Test
    @DisplayName("추천 갱신 시점에 글이 사라졌으면 feature store refresh를 건너뛴다")
    fun skipRecommendationRefreshWhenPostIsMissing() {
        // given
        `when`(postRepository.findById(11L)).thenReturn(Optional.empty())

        // when & then
        assertDoesNotThrow {
            handler.handle(
                PostWriteAfterCommitEvent(
                    command =
                        sideEffectCommand(
                            postId = 11L,
                            recommendationAction = PostRecommendationSideEffect.REFRESH,
                        ),
                    domainEvent = null,
                ),
            )
        }
        verify(postRecommendFeatureStoreService, never()).refresh(anyPost())
    }

    @Test
    @DisplayName("추천 갱신 전 누락된 post counter attr를 조회해 hydrate한다")
    fun hydrateMissingCountersBeforeRecommendationRefresh() {
        // given
        val post = testPost(16L)
        `when`(postRepository.findById(16L)).thenReturn(Optional.of(post))
        `when`(postAttrRepository.findBySubjectAndName(post, LIKES_COUNT))
            .thenReturn(PostAttr(1L, post, LIKES_COUNT, 7))
        `when`(postAttrRepository.findBySubjectAndName(post, COMMENTS_COUNT))
            .thenReturn(PostAttr(2L, post, COMMENTS_COUNT, 3))
        `when`(postAttrRepository.findBySubjectAndName(post, HIT_COUNT))
            .thenReturn(PostAttr(3L, post, HIT_COUNT, 11))

        // when
        handler.handle(
            PostWriteAfterCommitEvent(
                command =
                    sideEffectCommand(
                        postId = 16L,
                        recommendationAction = PostRecommendationSideEffect.REFRESH,
                    ),
                domainEvent = null,
            ),
        )

        // then
        assertThat(post.likesCount).isEqualTo(7)
        assertThat(post.commentsCount).isEqualTo(3)
        assertThat(post.hitCount).isEqualTo(11)
        verify(postRecommendFeatureStoreService).refresh(post)
    }

    @Test
    @DisplayName("post counter attr가 이미 있으면 추천 갱신 전 재조회하지 않는다")
    fun skipCounterLookupWhenCountersAlreadyHydrated() {
        // given
        val post = testPost(17L)
        post.likesCountAttr = PostAttr(4L, post, LIKES_COUNT, 8)
        post.commentsCountAttr = PostAttr(5L, post, COMMENTS_COUNT, 4)
        post.hitCountAttr = PostAttr(6L, post, HIT_COUNT, 12)
        `when`(postRepository.findById(17L)).thenReturn(Optional.of(post))

        // when
        handler.handle(
            PostWriteAfterCommitEvent(
                command =
                    sideEffectCommand(
                        postId = 17L,
                        recommendationAction = PostRecommendationSideEffect.REFRESH,
                    ),
                domainEvent = null,
            ),
        )

        // then
        verifyNoInteractions(postAttrRepository)
        verify(postRecommendFeatureStoreService).refresh(post)
    }

    private fun sideEffectCommand(
        postId: Long,
        previousContent: String? = null,
        currentContent: String? = null,
        recommendationAction: PostRecommendationSideEffect,
    ): PostWriteSideEffectCommand =
        PostWriteSideEffectCommand(
            postId = postId,
            previousContent = previousContent,
            currentContent = currentContent,
            deletedContent = null,
            beforeTags = emptyList(),
            afterTags = emptyList(),
            cacheInvalidationScope = PostReadCacheInvalidationScope.None,
            evictReason = "unit-test",
            recommendationAction = recommendationAction,
        )

    private fun anyPost(): Post =
        ArgumentMatchers.any(Post::class.java)
            ?: Post(
                author = Member(id = 0, username = "dummy", nickname = "dummy", apiKey = "dummy"),
                title = "dummy",
                content = "dummy",
            )

    private fun testPost(id: Long): Post =
        Post(
            id = id,
            author = Member(id = 1, username = "author", nickname = "작성자", apiKey = "author-api-key"),
            title = "title",
            content = "content",
            published = true,
            listed = true,
        )

    private class NoopTransactionManager : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()

        @Throws(TransactionException::class)
        override fun commit(status: TransactionStatus) = Unit

        @Throws(TransactionException::class)
        override fun rollback(status: TransactionStatus) = Unit
    }
}
