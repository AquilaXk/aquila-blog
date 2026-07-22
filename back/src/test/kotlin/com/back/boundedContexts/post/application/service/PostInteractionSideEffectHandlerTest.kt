package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.event.PostLikedEvent
import com.back.global.event.application.EventPublisher
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow
import org.mockito.ArgumentMatchers
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.context.ApplicationEventPublisher
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionException
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import java.time.Instant
import java.util.Optional
import java.util.UUID
import kotlin.reflect.full.declaredFunctions
import kotlin.reflect.jvm.isAccessible

@DisplayName("PostInteractionSideEffectHandler 테스트")
class PostInteractionSideEffectHandlerTest {
    private val postRecommendFeatureStoreService: PostRecommendFeatureStoreService =
        mock(PostRecommendFeatureStoreService::class.java)
    private val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
    private val postAttrRepository: PostAttrRepositoryPort = mock(PostAttrRepositoryPort::class.java)
    private val postReadCacheInvalidator: PostReadCacheInvalidator = mock(PostReadCacheInvalidator::class.java)

    @Test
    @DisplayName("interaction domain event 발행 실패는 task retry를 위해 전파한다")
    fun propagateRuntimePublishFailureWhenHandlingTaskPayload() {
        // given
        val handler = newHandler(ThrowingApplicationEventPublisher(RuntimeException("event bus down")))

        // when & then
        assertThatThrownBy {
            handler.handle(likedPayload())
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("event bus down")
    }

    @Test
    @DisplayName("interaction domain event non-runtime 실패는 retry 가능한 예외로 감싸 전파한다")
    fun wrapNonRuntimePublishFailureWhenHandlingTaskPayload() {
        // given
        val handler = newHandler(ThrowingApplicationEventPublisher(AssertionError("event publish failed")))

        // when & then
        assertThatThrownBy {
            handler.handle(likedPayload())
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Post interaction side effect failed")
            .hasCauseInstanceOf(AssertionError::class.java)
    }

    @Test
    @DisplayName("추천 갱신 시점에 글이 사라졌으면 interaction feature store refresh를 건너뛴다")
    fun skipRecommendationRefreshWhenPostIsMissing() {
        // given
        `when`(postRepository.findById(10L)).thenReturn(Optional.empty())

        // when & then
        assertDoesNotThrow {
            newHandler().handle(
                interactionPayload(
                    postId = 10L,
                    recommendationAction = PostInteractionRecommendationSideEffect.REFRESH,
                ),
            )
        }
        verify(postRecommendFeatureStoreService, never()).refresh(anyPost())
    }

    @Test
    @DisplayName("알 수 없는 interaction domain event type은 task 실패로 전파하지 않고 발행만 건너뛴다")
    fun skipUnknownDomainEventTypeWhenHandlingTaskPayload() {
        // given
        val applicationEventPublisher = RecordingApplicationEventPublisher()

        // when & then
        assertDoesNotThrow {
            newHandler(applicationEventPublisher).handle(
                interactionPayload(
                    domainEventUid = UUID.randomUUID(),
                    domainEventType = "unknown.event.Type",
                ),
            )
        }
        assertThat(applicationEventPublisher.publishedEvent).isNull()
    }

    @Test
    @DisplayName("좋아요 interaction payload는 domain event로 복원해 발행한다")
    fun publishLikedDomainEventFromTaskPayload() {
        // given
        val applicationEventPublisher = RecordingApplicationEventPublisher()

        // when
        newHandler(applicationEventPublisher).handle(likedPayload())

        // then
        assertThat(applicationEventPublisher.publishedEvent).isInstanceOf(PostLikedEvent::class.java)
    }

    @Test
    @DisplayName("HIT_COUNT ranked cache 무효화는 기본 reason hit으로 캐시를 축출한다")
    fun invalidateRankedCachesForHitCountUsesDefaultReason() {
        // given
        val handler = newHandler()

        // when
        assertDoesNotThrow {
            handler.handle(
                interactionPayload(
                    rankedCacheInvalidation = PostRankedCacheInvalidationSideEffect.HIT_COUNT,
                ),
            )
        }

        // then
        verify(postReadCacheInvalidator).invalidateRankedSortHotPages(
            "hit",
            listOf(PostSearchSortType1.HIT_COUNT),
        )
    }

    @Test
    @DisplayName("LIKES_COUNT ranked cache 무효화는 기본 reason like으로 캐시를 축출한다")
    fun invalidateRankedCachesForLikesCountUsesDefaultReason() {
        // given
        val handler = newHandler()

        // when
        assertDoesNotThrow {
            handler.handle(
                interactionPayload(
                    rankedCacheInvalidation = PostRankedCacheInvalidationSideEffect.LIKES_COUNT,
                ),
            )
        }

        // then
        verify(postReadCacheInvalidator).invalidateRankedSortHotPages(
            "like",
            listOf(PostSearchSortType1.LIKES_COUNT),
        )
    }

    @Test
    @DisplayName("명시 rankedCacheEvictReason이 있으면 기본 reason 대신 사용한다")
    fun invalidateRankedCachesUsesExplicitEvictReason() {
        // given
        val handler = newHandler()

        // when
        handler.handle(
            interactionPayload(
                rankedCacheInvalidation = PostRankedCacheInvalidationSideEffect.HIT_COUNT,
                rankedCacheEvictReason = "hit-sync",
            ),
        )

        // then
        verify(postReadCacheInvalidator).invalidateRankedSortHotPages(
            "hit-sync",
            listOf(PostSearchSortType1.HIT_COUNT),
        )
    }

    @Test
    @DisplayName("ranked cache invalidation NONE은 캐시 축출을 호출하지 않는다")
    fun invalidateRankedCachesNoOpForNone() {
        // given
        val handler = newHandler()
        val method =
            PostInteractionSideEffectHandler::class.declaredFunctions.single { it.name == "invalidateRankedCaches" }
        method.isAccessible = true

        // when
        assertDoesNotThrow {
            method.call(
                handler,
                interactionPayload(
                    rankedCacheInvalidation = PostRankedCacheInvalidationSideEffect.NONE,
                ),
            )
        }

        // then
        verify(postReadCacheInvalidator, never()).invalidateRankedSortHotPages(
            ArgumentMatchers.anyString(),
            ArgumentMatchers.anyList(),
        )
    }

    @Test
    @DisplayName("ranked cache 무효화 실패는 task retry를 위해 전파한다")
    fun propagateRankedCacheInvalidationFailure() {
        // given
        doThrow(RuntimeException("ranked cache down"))
            .`when`(postReadCacheInvalidator)
            .invalidateRankedSortHotPages(
                ArgumentMatchers.anyString(),
                ArgumentMatchers.anyList(),
            )

        // when & then
        assertThatThrownBy {
            newHandler().handle(
                interactionPayload(
                    rankedCacheInvalidation = PostRankedCacheInvalidationSideEffect.LIKES_COUNT,
                    rankedCacheEvictReason = "like",
                ),
            )
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("ranked cache down")
    }

    @Test
    @DisplayName("combined interaction payload에서 추천 갱신이 실패하면 이벤트를 발행하지 않는다")
    fun skipDomainEventPublishWhenCombinedPayloadRefreshFails() {
        // given
        val post = testPost(10L)
        val applicationEventPublisher = RecordingApplicationEventPublisher()
        `when`(postRepository.findById(10L)).thenReturn(Optional.of(post))
        doThrow(RuntimeException("refresh down"))
            .`when`(postRecommendFeatureStoreService)
            .refresh(post)

        // when & then
        assertThatThrownBy {
            newHandler(applicationEventPublisher).handle(
                likedPayload(recommendationAction = PostInteractionRecommendationSideEffect.REFRESH),
            )
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("refresh down")
        assertThat(applicationEventPublisher.publishedEvent).isNull()
    }

    private fun newHandler(
        applicationEventPublisher: ApplicationEventPublisher = RecordingApplicationEventPublisher(),
    ): PostInteractionSideEffectHandler =
        PostInteractionSideEffectHandler(
            postRecommendFeatureStoreService = postRecommendFeatureStoreService,
            postRepository = postRepository,
            postAttrRepository = postAttrRepository,
            postReadCacheInvalidator = postReadCacheInvalidator,
            eventPublisher = EventPublisher(applicationEventPublisher),
            transactionManager = NoopTransactionManager(),
        )

    private fun likedPayload(
        recommendationAction: PostInteractionRecommendationSideEffect = PostInteractionRecommendationSideEffect.NONE,
    ): PostInteractionSideEffectPayload =
        interactionPayload(
            recommendationAction = recommendationAction,
            domainEventUid = UUID.randomUUID(),
            domainEventType = PostLikedEvent::class.java.name,
            actorDto = testMemberDto(2L),
            postAuthorId = 1L,
            likeId = 3L,
        )

    private fun interactionPayload(
        postId: Long = 10L,
        recommendationAction: PostInteractionRecommendationSideEffect = PostInteractionRecommendationSideEffect.NONE,
        domainEventUid: UUID? = null,
        domainEventType: String? = null,
        actorDto: MemberDto? = null,
        postAuthorId: Long? = null,
        likeId: Long? = null,
        rankedCacheInvalidation: PostRankedCacheInvalidationSideEffect = PostRankedCacheInvalidationSideEffect.NONE,
        rankedCacheEvictReason: String? = null,
    ): PostInteractionSideEffectPayload =
        PostInteractionSideEffectPayload(
            uid = UUID.randomUUID(),
            aggregateType = "Post",
            aggregateId = postId,
            postId = postId,
            recommendationAction = recommendationAction,
            domainEventUid = domainEventUid,
            domainEventType = domainEventType,
            postCommentDto = null,
            postDto = null,
            actorDto = actorDto,
            replyReceiverId = null,
            postAuthorId = postAuthorId,
            likeId = likeId,
            rankedCacheInvalidation = rankedCacheInvalidation,
            rankedCacheEvictReason = rankedCacheEvictReason,
        )

    private fun testMemberDto(id: Long): MemberDto =
        MemberDto(
            id = id,
            createdAt = Instant.EPOCH,
            modifiedAt = Instant.EPOCH,
            isAdmin = false,
            name = "작성자",
            profileImageUrl = "",
        )

    private fun testPost(id: Long): Post =
        Post(
            id = id,
            author = Member(id = 1L, username = "author", nickname = "작성자", apiKey = "author-api-key"),
            title = "title",
            content = "content",
            published = true,
            listed = true,
        )

    private fun anyPost(): Post =
        ArgumentMatchers.any(Post::class.java)
            ?: Post(
                author =
                    Member(
                        id = 0L,
                        username = "dummy",
                        nickname = "dummy",
                        apiKey = "dummy",
                    ),
                title = "dummy",
                content = "dummy",
            )

    private class NoopTransactionManager : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()

        @Throws(TransactionException::class)
        override fun commit(status: TransactionStatus) = Unit

        @Throws(TransactionException::class)
        override fun rollback(status: TransactionStatus) = Unit
    }

    private class RecordingApplicationEventPublisher : ApplicationEventPublisher {
        var publishedEvent: Any? = null

        override fun publishEvent(event: Any) {
            publishedEvent = event
        }
    }

    private class ThrowingApplicationEventPublisher(
        private val throwable: Throwable,
    ) : ApplicationEventPublisher {
        override fun publishEvent(event: Any): Unit = throw throwable
    }
}
