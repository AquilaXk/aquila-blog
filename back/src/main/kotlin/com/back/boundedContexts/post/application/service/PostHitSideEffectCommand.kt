package com.back.boundedContexts.post.application.service

import com.back.global.task.annotation.Task
import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.standard.dto.TaskPayload
import java.util.UUID

@Task(
    type = PostHitSideEffectPayload.TASK_TYPE,
    schemaVersion = 2,
    sensitivity = TaskPayloadSensitivity.PUBLIC,
    label = "게시글 조회수 후속 작업",
    maxRetries = 5,
    baseDelaySeconds = 10,
    backoffMultiplier = 2.0,
    maxDelaySeconds = 300,
)
data class PostHitSideEffectPayload(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Long,
    val postId: Long,
    val reason: String,
) : TaskPayload {
    companion object {
        const val TASK_TYPE = "post.hit.side-effect"
    }
}
