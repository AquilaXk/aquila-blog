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
import com.back.global.event.application.EventPublisher
import com.back.global.storage.application.UploadedFileRetentionService
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock
import org.springframework.cache.CacheManager
import java.time.Instant

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
    private val postRecommendRankingService: PostRecommendRankingService = mock(PostRecommendRankingService::class.java)
    private val postRecommendFeatureStoreService: PostRecommendFeatureStoreService =
        mock(PostRecommendFeatureStoreService::class.java)
    private val postKeywordSearchPipelineService: PostKeywordSearchPipelineService =
        mock(PostKeywordSearchPipelineService::class.java)

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
            cacheManager = cacheManager,
            postRecommendRankingService = postRecommendRankingService,
            postRecommendFeatureStoreService = postRecommendFeatureStoreService,
            postKeywordSearchPipelineService = postKeywordSearchPipelineService,
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
}
