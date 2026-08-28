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
        postReadCacheInvalidator.invalidateRankedSortHotPages(
            payload.reason,
            listOf(PostSearchSortType1.HIT_COUNT),
        )
    }
}
