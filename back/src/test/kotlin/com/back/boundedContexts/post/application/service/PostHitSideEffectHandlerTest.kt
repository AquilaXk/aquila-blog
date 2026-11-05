package com.back.boundedContexts.post.application.service

import com.back.standard.dto.post.type1.PostSearchSortType1
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import java.util.UUID

class PostHitSideEffectHandlerTest {
    private val postReadCacheInvalidator: PostReadCacheInvalidator = mock(PostReadCacheInvalidator::class.java)
    private val handler = PostHitSideEffectHandler(postReadCacheInvalidator)

    @Test
    fun invalidateOnlyHitCountRankedPagesWithPayloadReason() {
        handler.handle(
            PostHitSideEffectPayload(
                uid = UUID.randomUUID(),
                aggregateType = "Post",
                aggregateId = 10L,
                postId = 10L,
                reason = "hit",
            ),
        )

        verify(postReadCacheInvalidator).invalidateRankedSortHotPages(
            "hit",
            listOf(PostSearchSortType1.HIT_COUNT),
        )
    }

    @Test
    fun invalidateLikesCountRankedPagesAndPublicDetailCountersWhenReasonIsLike() {
        handler.handle(
            PostHitSideEffectPayload(
                uid = UUID.randomUUID(),
                aggregateType = "Post",
                aggregateId = 11L,
                postId = 11L,
                reason = "like",
            ),
        )

        verify(postReadCacheInvalidator).invalidateRankedSortHotPages(
            "like",
            listOf(PostSearchSortType1.LIKES_COUNT),
        )
        verify(postReadCacheInvalidator).invalidatePublicDetailCounters(11L, "like")
    }

    @Test
    fun invalidateLikesCountRankedPagesAndPublicDetailCountersWhenReasonIsUnlike() {
        handler.handle(
            PostHitSideEffectPayload(
                uid = UUID.randomUUID(),
                aggregateType = "Post",
                aggregateId = 12L,
                postId = 12L,
                reason = "unlike",
            ),
        )

        verify(postReadCacheInvalidator).invalidateRankedSortHotPages(
            "unlike",
            listOf(PostSearchSortType1.LIKES_COUNT),
        )
        verify(postReadCacheInvalidator).invalidatePublicDetailCounters(12L, "unlike")
    }
}
