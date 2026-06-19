package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.dto.PostCommentDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.global.task.annotation.Task
import com.back.standard.dto.TaskPayload
import java.util.UUID

@Task(
    type = PostInteractionSideEffectPayload.TASK_TYPE,
    label = "게시글 상호작용 후속 작업",
    maxRetries = 5,
    baseDelaySeconds = 10,
    backoffMultiplier = 2.0,
    maxDelaySeconds = 300,
)
data class PostInteractionSideEffectPayload(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Long,
    val postId: Long,
    val recommendationAction: PostInteractionRecommendationSideEffect,
    val domainEventUid: UUID?,
    val domainEventType: String?,
    val postCommentDto: PostCommentDto?,
    val postDto: PostDto?,
    val actorDto: MemberDto?,
    val replyReceiverId: Long?,
    val postAuthorId: Long?,
    val likeId: Long?,
) : TaskPayload {
    companion object {
        const val TASK_TYPE = "post.interaction.side-effect"
    }
}

enum class PostInteractionRecommendationSideEffect {
    NONE,
    REFRESH,
}
