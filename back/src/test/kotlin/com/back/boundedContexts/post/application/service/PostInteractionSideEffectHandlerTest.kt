package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.postMixin.COMMENTS_COUNT
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.boundedContexts.post.dto.PostCommentDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.event.PostCommentDeletedEvent
import com.back.boundedContexts.post.event.PostCommentModifiedEvent
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import com.back.boundedContexts.post.event.PostLikedEvent
import com.back.boundedContexts.post.event.PostUnlikedEvent
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
    @DisplayName("retained interaction payloads restore every accepted domain event type")
    fun publishAllRetainedDomainEventTypes() {
        val commentDto = testCommentDto()
        val postDto = testPostDto()
        val actorDto = testMemberDto(2L)
        val eventTypes =
            listOf(
                PostCommentWrittenEvent::class.java,
                PostCommentModifiedEvent::class.java,
                PostCommentDeletedEvent::class.java,
                PostLikedEvent::class.java,
                PostUnlikedEvent::class.java,
            )

        eventTypes.forEach { eventType ->
            val publisher = RecordingApplicationEventPublisher()
            newHandler(publisher).handle(
                interactionPayload(
                    domainEventUid = UUID.randomUUID(),
                    domainEventType = eventType.name,
                    postCommentDto = commentDto,
                    postDto = postDto,
                    actorDto = actorDto,
                    replyReceiverId = 7L,
                    postAuthorId = 1L,
                    likeId = 3L,
                ),
            )

            assertThat(publisher.publishedEvent).isInstanceOf(eventType)
            if (publisher.publishedEvent is PostCommentWrittenEvent) {
                val event = publisher.publishedEvent as PostCommentWrittenEvent
                assertThat(event.getPostCommentDtoForJson().content).isEmpty()
                assertThat(event.getPostDtoForJson())
                    .extracting(PostDto::title, PostDto::summary)
                    .containsExactly("", "")
            }
        }
    }

    @Test
    @DisplayName("retained interaction payload rejects incomplete domain event identity")
    fun rejectIncompleteDomainEventIdentity() {
        assertThatThrownBy {
            newHandler().handle(interactionPayload(domainEventUid = UUID.randomUUID()))
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("domain event type is required")

        assertThatThrownBy {
            newHandler().handle(interactionPayload(domainEventType = PostLikedEvent::class.java.name))
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("domain event uid is required")
    }

    @Test
    @DisplayName("public post recommendation refresh hydrates retained counters")
    fun refreshPublicPostHydratesRetainedCounters() {
        val post = testPost(10L)
        val likesCount = PostAttr(1L, post, LIKES_COUNT, 2)
        val commentsCount = PostAttr(2L, post, COMMENTS_COUNT, 3)
        val hitCount = PostAttr(3L, post, HIT_COUNT, 4)
        `when`(postRepository.findById(post.id)).thenReturn(Optional.of(post))
        `when`(postAttrRepository.findBySubjectAndName(post, LIKES_COUNT)).thenReturn(likesCount)
        `when`(postAttrRepository.findBySubjectAndName(post, COMMENTS_COUNT)).thenReturn(commentsCount)
        `when`(postAttrRepository.findBySubjectAndName(post, HIT_COUNT)).thenReturn(hitCount)

        newHandler().handle(
            interactionPayload(
                postId = post.id,
                recommendationAction = PostInteractionRecommendationSideEffect.REFRESH,
            ),
        )

        assertThat(post.likesCountAttr).isSameAs(likesCount)
        assertThat(post.commentsCountAttr).isSameAs(commentsCount)
        assertThat(post.hitCountAttr).isSameAs(hitCount)
        verify(postRecommendFeatureStoreService).refresh(post)
    }

    @Test
    @DisplayName("multiple retained side-effect failures preserve every retry cause")
    fun preserveSuppressedRetryCauses() {
        val post = testPost(10L)
        val refreshFailure = RuntimeException("refresh down")
        val cacheFailure = RuntimeException("ranked cache down")
        `when`(postRepository.findById(post.id)).thenReturn(Optional.of(post))
        doThrow(refreshFailure).`when`(postRecommendFeatureStoreService).refresh(post)
        doThrow(cacheFailure)
            .`when`(postReadCacheInvalidator)
            .invalidateRankedSortHotPages("like", listOf(PostSearchSortType1.LIKES_COUNT))

        val thrown =
            org.junit.jupiter.api.assertThrows<RuntimeException> {
                newHandler().handle(
                    interactionPayload(
                        postId = post.id,
                        recommendationAction = PostInteractionRecommendationSideEffect.REFRESH,
                        rankedCacheInvalidation = PostRankedCacheInvalidationSideEffect.LIKES_COUNT,
                        rankedCacheEvictReason = "like",
                    ),
                )
            }

        assertThat(thrown).isSameAs(refreshFailure)
        assertThat(thrown.suppressed).containsExactly(cacheFailure)
    }

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
    @DisplayName("추천 갱신 시점에 글이 사라졌으면 task retry를 위해 실패한다")
    fun failRecommendationRefreshWhenPostIsMissing() {
        // given
        `when`(postRepository.findById(10L)).thenReturn(Optional.empty())

        // when & then
        assertThatThrownBy {
            newHandler().handle(
                interactionPayload(
                    postId = 10L,
                    recommendationAction = PostInteractionRecommendationSideEffect.REFRESH,
                ),
            )
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("missing postId=10")
        verify(postRecommendFeatureStoreService, never()).refresh(anyPost())
    }

    @Test
    @DisplayName("알 수 없는 interaction domain event type은 task retry를 위해 실패한다")
    fun failUnknownDomainEventTypeWhenHandlingTaskPayload() {
        // given
        val applicationEventPublisher = RecordingApplicationEventPublisher()

        // when & then
        assertThatThrownBy {
            newHandler(applicationEventPublisher).handle(
                interactionPayload(
                    domainEventUid = UUID.randomUUID(),
                    domainEventType = "unknown.event.Type",
                ),
            )
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Unsupported post interaction domain event type")
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
    @DisplayName("HIT_COUNT ranked cache 무효화 reason이 없으면 task retry를 위해 실패한다")
    fun failRankedCacheInvalidationWhenReasonIsMissing() {
        // given
        val handler = newHandler()

        // when
        assertThatThrownBy {
            handler.handle(
                interactionPayload(
                    rankedCacheInvalidation = PostRankedCacheInvalidationSideEffect.HIT_COUNT,
                ),
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Ranked cache invalidation reason is required")

        // then
        verify(postReadCacheInvalidator, never()).invalidateRankedSortHotPages(
            ArgumentMatchers.anyString(),
            ArgumentMatchers.anyList(),
        )
    }

    @Test
    @DisplayName("LIKES_COUNT ranked cache 무효화는 명시 reason으로 캐시를 축출한다")
    fun invalidateRankedCachesForLikesCountUsesExplicitReason() {
        // given
        val handler = newHandler()

        // when
        assertDoesNotThrow {
            handler.handle(
                interactionPayload(
                    rankedCacheInvalidation = PostRankedCacheInvalidationSideEffect.LIKES_COUNT,
                    rankedCacheEvictReason = "like",
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
    @DisplayName("명시 rankedCacheEvictReason을 그대로 사용한다")
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
    @DisplayName("ranked 기본 인자를 생략한 payload 생성은 default constructor 경로를 탄다")
    fun payloadConstructionUsesDefaultRankedCacheArgs() {
        // given & when — omit trailing defaults so Kotlin $default ctor (JaCoCo L34) is exercised
        val payload =
            PostInteractionSideEffectPayload(
                uid = UUID.randomUUID(),
                aggregateType = "Post",
                aggregateId = 10L,
                postId = 10L,
                recommendationAction = PostInteractionRecommendationSideEffect.NONE,
                domainEventUid = null,
                domainEventType = null,
                postCommentDto = null,
                postDto = null,
                actorDto = null,
                replyReceiverId = null,
                postAuthorId = null,
                likeId = null,
            )

        // then
        assertThat(payload.rankedCacheInvalidation).isEqualTo(PostRankedCacheInvalidationSideEffect.NONE)
        assertThat(payload.rankedCacheEvictReason).isNull()
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
        postCommentDto: PostCommentDto? = null,
        postDto: PostDto? = null,
        actorDto: MemberDto? = null,
        replyReceiverId: Long? = null,
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
            postCommentDto = postCommentDto,
            postDto = postDto,
            actorDto = actorDto,
            replyReceiverId = replyReceiverId,
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

    private fun testCommentDto(): PostCommentDto =
        PostCommentDto(
            id = 20L,
            createdAt = Instant.EPOCH,
            modifiedAt = Instant.EPOCH,
            authorId = 2L,
            authorName = "Commenter",
            authorUsername = "commenter",
            authorProfileImageUrl = "",
            authorProfileImageDirectUrl = "",
            postId = 10L,
            parentCommentId = null,
            content = "queued comment",
        )

    private fun testPostDto(): PostDto =
        PostDto(
            id = 10L,
            createdAt = Instant.EPOCH,
            modifiedAt = Instant.EPOCH,
            authorId = 1L,
            authorName = "Author",
            authorUsername = "author",
            authorProfileImgUrl = "",
            title = "Post title",
            summary = "Post summary",
            version = 1L,
            published = true,
            listed = true,
            likesCount = 0,
            commentsCount = 1,
            hitCount = 0,
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
