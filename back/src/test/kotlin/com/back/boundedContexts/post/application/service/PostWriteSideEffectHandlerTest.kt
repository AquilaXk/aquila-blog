package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.global.storage.application.UploadedFileRetentionService
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow
import org.mockito.ArgumentMatchers
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.cache.concurrent.ConcurrentMapCacheManager
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionException
import org.springframework.transaction.TransactionStatus
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
    private val handler =
        PostWriteSideEffectHandler(
            postReadCacheInvalidator = PostReadCacheInvalidator(ConcurrentMapCacheManager()),
            uploadedFileRetentionService = uploadedFileRetentionService,
            postRecommendFeatureStoreService = postRecommendFeatureStoreService,
            postRepository = postRepository,
            postAttrRepository = postAttrRepository,
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
            handler.enqueue(
                sideEffectCommand(
                    postId = 10L,
                    previousContent = "before",
                    currentContent = "after",
                    recommendationAction = PostRecommendationSideEffect.EVICT,
                ),
            ) {}
        }
        verify(postRecommendFeatureStoreService).evict(10L)
    }

    @Test
    @DisplayName("추천 갱신 시점에 글이 사라졌으면 feature store refresh를 건너뛴다")
    fun skipRecommendationRefreshWhenPostIsMissing() {
        // given
        `when`(postRepository.findById(11L)).thenReturn(Optional.empty())

        // when & then
        assertDoesNotThrow {
            handler.enqueue(
                sideEffectCommand(
                    postId = 11L,
                    recommendationAction = PostRecommendationSideEffect.REFRESH,
                ),
            ) {}
        }
        verify(postRecommendFeatureStoreService, never()).refresh(anyPost())
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
            evictHotReadPages = false,
            evictSearchFirstPage = false,
            evictImpactedTagPages = false,
            evictTagsPublic = false,
            evictDetail = false,
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

    private class NoopTransactionManager : PlatformTransactionManager {
        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()

        @Throws(TransactionException::class)
        override fun commit(status: TransactionStatus) = Unit

        @Throws(TransactionException::class)
        override fun rollback(status: TransactionStatus) = Unit
    }
}
