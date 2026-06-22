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
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.event.PostAccountDeletionDeletedEvent
import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.global.event.application.EventPublisher
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.task.annotation.TaskHandler
import com.back.standard.dto.EventPayload
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
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.cache.concurrent.ConcurrentMapCacheManager
import org.springframework.context.ApplicationEventPublisher
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionException
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.Optional
import java.util.UUID

@DisplayName("PostWriteSideEffectHandler 테스트")
class PostWriteSideEffectHandlerTest {
    private val uploadedFileRetentionService: UploadedFileRetentionService =
        mock(UploadedFileRetentionService::class.java)
    private val postRecommendFeatureStoreService: PostRecommendFeatureStoreService =
        mock(PostRecommendFeatureStoreService::class.java)
    private val postRepository: PostRepositoryPort = mock(PostRepositoryPort::class.java)
    private val postAttrRepository: PostAttrRepositoryPort = mock(PostAttrRepositoryPort::class.java)
    private val eventPublisher: EventPublisher = mock(EventPublisher::class.java)
    private val handler = newHandler()

    private fun newHandler(eventPublisher: EventPublisher = this.eventPublisher): PostWriteSideEffectHandler =
        PostWriteSideEffectHandler(
            postReadCacheInvalidator = PostReadCacheInvalidator(ConcurrentMapCacheManager()),
            uploadedFileRetentionService = uploadedFileRetentionService,
            postRecommendFeatureStoreService = postRecommendFeatureStoreService,
            postRepository = postRepository,
            postAttrRepository = postAttrRepository,
            eventPublisher = eventPublisher,
            objectMapper = ObjectMapper(),
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
    @DisplayName("후속 작업 handler는 durable task payload handler로 등록된다")
    fun handlePostWriteSideEffectPayloadAsTaskHandler() {
        // when
        val handlerMethods =
            PostWriteSideEffectHandler::class.java
                .methods
                .filter { method ->
                    method.name == "handle" &&
                        method.parameterTypes.contentEquals(arrayOf(PostWriteSideEffectPayload::class.java))
                }

        // then
        assertThat(handlerMethods).hasSize(1)
        assertThat(handlerMethods.single().getAnnotation(TaskHandler::class.java)).isNotNull()
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
    @DisplayName("task payload 처리 중 첨부파일 동기화 실패는 task retry를 위해 전파한다")
    fun propagateAttachmentSyncFailureWhenHandlingTaskPayload() {
        // given
        doThrow(RuntimeException("storage down"))
            .`when`(uploadedFileRetentionService)
            .syncPostContent(20L, "before", "after")

        val payload =
            postWriteSideEffectPayload(
                postId = 20L,
                previousContent = "before",
                currentContent = "after",
                recommendationAction = PostRecommendationSideEffect.EVICT,
            )

        // when & then
        assertThatThrownBy {
            handler.handle(payload)
        }.isInstanceOf(RuntimeException::class.java)
            .hasMessageContaining("storage down")
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

    @Test
    @DisplayName("삭제 domain event payload는 durable task 처리 중 복원해 발행한다")
    fun publishDeletedDomainEventFromTaskPayload() {
        // given
        val post = testPost(30L)
        val domainEvent =
            PostDeletedEvent(
                uid = UUID.randomUUID(),
                postDto = testPostDto(post.id),
                actorDto = testMemberDto(post.author.id),
                beforeTags = listOf("spring"),
                afterTags = emptyList(),
            )
        val payload =
            postWriteSideEffectPayload(
                postId = 30L,
                recommendationAction = PostRecommendationSideEffect.EVICT,
                domainEventType = PostDeletedEvent::class.java.name,
                domainEventJson = ObjectMapper().writeValueAsString(domainEvent),
            )

        // when
        val applicationEventPublisher = RecordingApplicationEventPublisher()
        newHandler(EventPublisher(applicationEventPublisher)).handle(payload)

        // then
        assertThat(applicationEventPublisher.publishedEvent).isInstanceOf(PostDeletedEvent::class.java)
    }

    @Test
    @DisplayName("계정 탈퇴 삭제 domain event payload는 durable task 처리 중 복원해 발행한다")
    fun publishAccountDeletionDeletedDomainEventFromTaskPayload() {
        // given
        val domainEvent =
            PostAccountDeletionDeletedEvent(
                uid = UUID.randomUUID(),
                aggregateId = 33L,
                beforeTags = listOf("privacy"),
            )
        val payload =
            postWriteSideEffectPayload(
                postId = 33L,
                recommendationAction = PostRecommendationSideEffect.EVICT,
                domainEventType = PostAccountDeletionDeletedEvent::class.java.name,
                domainEventJson = ObjectMapper().writeValueAsString(domainEvent),
            )

        // when
        val applicationEventPublisher = RecordingApplicationEventPublisher()
        newHandler(EventPublisher(applicationEventPublisher)).handle(payload)

        // then
        val publishedEvent = applicationEventPublisher.publishedEvent
        assertThat(publishedEvent).isInstanceOf(PostAccountDeletionDeletedEvent::class.java)
        assertThat((publishedEvent as PostAccountDeletionDeletedEvent).beforeTags).containsExactly("privacy")
    }

    @Test
    @DisplayName("domain event 없는 durable task payload도 삭제 첨부 정리와 추천 갱신을 수행한다")
    fun handleTaskPayloadWithoutDomainEvent() {
        // given
        val post = testPost(34L)
        `when`(postRepository.findById(34L)).thenReturn(Optional.of(post))
        val payload =
            postWriteSideEffectPayload(
                postId = 34L,
                deletedContent = "deleted content",
                recommendationAction = PostRecommendationSideEffect.REFRESH,
            )

        // when
        handler.handle(payload)

        // then
        verify(uploadedFileRetentionService).scheduleDeletedPostAttachments("deleted content")
        verify(postRecommendFeatureStoreService).refresh(post)
        verifyNoInteractions(eventPublisher)
    }

    @Test
    @DisplayName("알 수 없는 domain event type은 task 실패로 전파하지 않고 발행만 건너뛴다")
    fun skipUnknownDomainEventTypeWhenHandlingTaskPayload() {
        // given
        val payload =
            postWriteSideEffectPayload(
                postId = 31L,
                recommendationAction = PostRecommendationSideEffect.EVICT,
                domainEventType = "unknown.event.Type",
                domainEventJson = "{}",
            )

        // when & then
        assertDoesNotThrow {
            handler.handle(payload)
        }
        verifyNoInteractions(eventPublisher)
    }

    @Test
    @DisplayName("task payload 처리 중 non-runtime 실패는 retry 가능한 예외로 감싸 전파한다")
    fun wrapNonRuntimeFailureWhenHandlingTaskPayload() {
        // given
        val post = testPost(32L)
        val domainEvent =
            PostDeletedEvent(
                uid = UUID.randomUUID(),
                postDto = testPostDto(post.id),
                actorDto = testMemberDto(post.author.id),
            )
        val applicationEventPublisher = ThrowingApplicationEventPublisher(AssertionError("event publish failed"))

        val payload =
            postWriteSideEffectPayload(
                postId = 32L,
                recommendationAction = PostRecommendationSideEffect.EVICT,
                domainEventType = PostDeletedEvent::class.java.name,
                domainEventJson = ObjectMapper().writeValueAsString(domainEvent),
            )

        // when & then
        assertThatThrownBy {
            newHandler(EventPublisher(applicationEventPublisher)).handle(payload)
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Post write side effect failed")
            .hasCauseInstanceOf(AssertionError::class.java)
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

    private fun testPostDto(id: Long): PostDto =
        PostDto(
            id = id,
            createdAt = Instant.EPOCH,
            modifiedAt = Instant.EPOCH,
            authorId = 1L,
            authorName = "작성자",
            authorUsername = "author",
            authorProfileImgUrl = "",
            title = "title",
            thumbnail = null,
            summary = "summary",
            version = 1L,
            published = true,
            listed = true,
            likesCount = 0,
            commentsCount = 0,
            hitCount = 0,
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

    private fun postWriteSideEffectPayload(
        postId: Long,
        previousContent: String? = null,
        currentContent: String? = null,
        deletedContent: String? = null,
        beforeTags: List<String> = emptyList(),
        afterTags: List<String> = emptyList(),
        recommendationAction: PostRecommendationSideEffect = PostRecommendationSideEffect.REFRESH,
        domainEventType: String? = null,
        domainEventJson: String? = null,
    ): PostWriteSideEffectPayload =
        PostWriteSideEffectPayload(
            uid = UUID.randomUUID(),
            aggregateType = "Post",
            aggregateId = postId,
            postId = postId,
            previousContent = previousContent,
            currentContent = currentContent,
            deletedContent = deletedContent,
            beforeTags = beforeTags,
            afterTags = afterTags,
            cacheInvalidationTargets = emptySet(),
            evictReason = "test",
            recommendationAction = recommendationAction,
            domainEventType = domainEventType,
            domainEventJson = domainEventJson,
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
