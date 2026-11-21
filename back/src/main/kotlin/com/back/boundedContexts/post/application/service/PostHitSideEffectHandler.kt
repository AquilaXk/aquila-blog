package com.back.boundedContexts.post.application.service

import com.back.global.task.annotation.TaskHandler
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.springframework.stereotype.Component

@Component
class PostHitSideEffectHandler(
    private val postReadCacheInvalidator: PostReadCacheInvalidator,
) {
    @TaskHandler
    fun handle(payload: PostHitSideEffectPayload) {
        val targetSort =
            when (payload.reason) {
                "like", "unlike" -> PostSearchSortType1.LIKES_COUNT
                else -> PostSearchSortType1.HIT_COUNT
            }
        postReadCacheInvalidator.invalidateRankedSortHotPages(
            payload.reason,
            listOf(targetSort),
        )
        postReadCacheInvalidator.invalidatePublicDetailCounters(payload.postId, payload.reason)
    }
}
