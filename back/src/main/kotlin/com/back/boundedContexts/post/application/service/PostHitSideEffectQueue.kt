package com.back.boundedContexts.post.application.service

import com.back.global.task.application.TaskFacade
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class PostHitSideEffectQueue(
    private val taskFacade: TaskFacade,
) {
    fun enqueue(postId: Long) {
        taskFacade.addToQueue(
            PostHitSideEffectPayload(
                uid = UUID.randomUUID(),
                aggregateType = "Post",
                aggregateId = postId,
                postId = postId,
                reason = "hit",
            ),
        )
    }
}
