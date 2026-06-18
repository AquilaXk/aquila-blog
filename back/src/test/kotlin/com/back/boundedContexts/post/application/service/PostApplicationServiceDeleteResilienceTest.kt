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
import com.back.global.event.application.EventPublisher
import com.back.global.storage.application.UploadedFileRetentionService
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.cache.CacheManager
import org.springframework.context.ApplicationEventPublisher
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionException
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import java.time.Instant
import java.util.Optional

@org.junit.jupiter.api.DisplayName("PostApplicationServiceDeleteResilience 테스트")
class PostApplicationServiceDeleteResilienceTest {
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
    private val applicationEventPublisher: ApplicationEventPublisher = mock(ApplicationEventPublisher::class.java)
    private val postReadCacheInvalidator = PostReadCacheInvalidator(cacheManager)
    private val postWriteSideEffectHandler =
        PostWriteSideEffectHandler(
            postReadCacheInvalidator = postReadCacheInvalidator,
            uploadedFileRetentionService = uploadedFileRetentionService,
            postRecommendFeatureStoreService = postRecommendFeatureStoreService,
            postRepository = postRepository,
            postAttrRepository = postAttrRepository,
            eventPublisher = eventPublisher,
            transactionManager = transactionManager,
        )

    private val service =
        PostApplicationService(
            postRepository = postRepository,
            postTagIndexRepository = postTagIndexRepository,
            postAttrRepository = postAttrRepository,
            memberAttrRepository = memberAttrRepository,
            postCommentRepository = postCommentRepository,
            postLikeRepository = postLikeRepository,
            postWriteRequestIdempotencyRepository = postWriteRequestIdempotencyRepository,
            secureTipPort = secureTipPort,
            eventPublisher = eventPublisher,
            uploadedFileRetentionService = uploadedFileRetentionService,
            postRecommendRankingService = postRecommendRankingService,
            postRecommendFeatureStoreService = postRecommendFeatureStoreService,
            postKeywordSearchPipelineService = postKeywordSearchPipelineService,
            applicationEventPublisher = applicationEventPublisher,
            tagsLocalCacheTtlSeconds = 180,
        )

    @Test
    fun `delete는 member posts 카운터 보정 실패가 나도 soft delete를 완료한다`() {
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

        assertDoesNotThrow {
            service.delete(post, actor)
        }

        then(postRepository).should().softDeleteById(post.id)
        then(memberAttrRepository).should().incrementIntValue(author, POSTS_COUNT, -1)
        then(postRepository).should().countByAuthor(author)
    }

    @Test
    fun `관리자 복구는 캐시와 추천 후속 작업을 commit 이후에 실행한다`() {
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 21,
                title = "복구 대상",
                content = "복구 본문 #tag",
                authorId = 3,
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

        service.restoreDeletedByIdForAdmin(21)
        val afterCommitEvent = capturePostWriteAfterCommitEvent()

        verifyNoInteractions(cacheManager, postRecommendFeatureStoreService)

        postWriteSideEffectHandler.handle(afterCommitEvent)

        then(cacheManager).should().getCache(PostQueryCacheNames.FEED)
        then(postRecommendFeatureStoreService).should().refresh(restoredPost)
    }

    @Test
    fun `관리자 영구삭제는 캐시와 첨부파일 정리와 추천 evict를 commit 이후에 실행한다`() {
        val snapshot =
            AdmDeletedPostSnapshotDto(
                id = 22,
                title = "영구삭제 대상",
                content = "영구삭제 본문 #tag",
                authorId = 4,
            )
        given(postRepository.findDeletedSnapshotById(22)).willReturn(snapshot)
        given(postRepository.hardDeleteDeletedById(22)).willReturn(true)

        service.hardDeleteDeletedByIdForAdmin(22)
        val afterCommitEvent = capturePostWriteAfterCommitEvent()

        verifyNoInteractions(cacheManager, uploadedFileRetentionService, postRecommendFeatureStoreService)

        postWriteSideEffectHandler.handle(afterCommitEvent)

        then(cacheManager).should().getCache(PostQueryCacheNames.FEED)
        then(uploadedFileRetentionService).should().scheduleDeletedPostAttachments(snapshot.content)
        then(postRecommendFeatureStoreService).should().evict(22)
    }

    private fun capturePostWriteAfterCommitEvent(): PostWriteAfterCommitEvent {
        val captor = ArgumentCaptor.forClass(PostWriteAfterCommitEvent::class.java)
        then(applicationEventPublisher).should().publishEvent(captor.capture())
        return captor.value
    }

    private class NoopTransactionManager : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()

        @Throws(TransactionException::class)
        override fun commit(status: TransactionStatus) = Unit

        @Throws(TransactionException::class)
        override fun rollback(status: TransactionStatus) = Unit
    }
}
