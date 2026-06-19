package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.dto.PostCommentDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.event.PostCommentDeletedEvent
import com.back.boundedContexts.post.event.PostCommentModifiedEvent
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import com.back.boundedContexts.post.event.PostLikedEvent
import com.back.boundedContexts.post.event.PostUnlikedEvent
import com.back.global.task.application.TaskFacade
import com.back.standard.dto.EventPayload
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets
import java.util.UUID

@Service
class PostInteractionSideEffectQueue(
    private val taskFacade: TaskFacade,
) {
    fun enqueue(
        postId: Long,
        recommendationAction: PostInteractionRecommendationSideEffect = PostInteractionRecommendationSideEffect.NONE,
        domainEvent: EventPayload? = null,
        operationUid: UUID = UUID.randomUUID(),
    ) {
        if (domainEvent != null && recommendationAction != PostInteractionRecommendationSideEffect.NONE) {
            addTask(
                postId = postId,
                recommendationAction = PostInteractionRecommendationSideEffect.NONE,
                domainEvent = domainEvent,
                operationUid = operationUid,
            )
            addTask(
                postId = postId,
                recommendationAction = recommendationAction,
                domainEvent = null,
                operationUid = refreshTaskUid(domainEvent),
            )
            return
        }

        addTask(
            postId = postId,
            recommendationAction = recommendationAction,
            domainEvent = domainEvent,
            operationUid = operationUid,
        )
    }

    private fun addTask(
        postId: Long,
        recommendationAction: PostInteractionRecommendationSideEffect,
        domainEvent: EventPayload?,
        operationUid: UUID,
    ) {
        taskFacade.addToQueue(
            PostInteractionSideEffectPayload(
                uid = taskUid(domainEvent, operationUid),
                aggregateType = domainEvent?.aggregateType ?: "Post",
                aggregateId = domainEvent?.aggregateId ?: postId,
                postId = postId,
                recommendationAction = recommendationAction,
                domainEventUid = domainEvent?.uid,
                domainEventType = domainEvent?.javaClass?.name,
                postCommentDto = commentDto(domainEvent),
                postDto = postDto(domainEvent),
                actorDto = actorDto(domainEvent),
                replyReceiverId = replyReceiverId(domainEvent),
                postAuthorId = postAuthorId(domainEvent),
                likeId = likeId(domainEvent),
            ),
            inlineWhenEnabled = false,
        )
    }

    private fun refreshTaskUid(domainEvent: EventPayload): UUID =
        UUID.nameUUIDFromBytes(
            "${PostInteractionSideEffectPayload.TASK_TYPE}:refresh:${domainEvent.uid}".toByteArray(
                StandardCharsets.UTF_8,
            ),
        )

    private fun commentDto(domainEvent: EventPayload?): PostCommentDto? =
        when (domainEvent) {
            is PostCommentWrittenEvent -> domainEvent.postCommentDto
            is PostCommentModifiedEvent -> domainEvent.postCommentDto
            is PostCommentDeletedEvent -> domainEvent.postCommentDto
            else -> null
        }

    private fun postDto(domainEvent: EventPayload?): PostDto? =
        when (domainEvent) {
            is PostCommentWrittenEvent -> domainEvent.postDto
            is PostCommentModifiedEvent -> domainEvent.postDto
            is PostCommentDeletedEvent -> domainEvent.postDto
            else -> null
        }

    private fun actorDto(domainEvent: EventPayload?): MemberDto? =
        when (domainEvent) {
            is PostCommentWrittenEvent -> domainEvent.actorDto
            is PostCommentModifiedEvent -> domainEvent.actorDto
            is PostCommentDeletedEvent -> domainEvent.actorDto
            is PostLikedEvent -> domainEvent.actorDto
            is PostUnlikedEvent -> domainEvent.actorDto
            else -> null
        }

    private fun replyReceiverId(domainEvent: EventPayload?): Long? =
        when (domainEvent) {
            is PostCommentWrittenEvent -> domainEvent.replyReceiverId
            else -> null
        }

    private fun postAuthorId(domainEvent: EventPayload?): Long? =
        when (domainEvent) {
            is PostLikedEvent -> domainEvent.postAuthorId
            is PostUnlikedEvent -> domainEvent.postAuthorId
            else -> null
        }

    private fun likeId(domainEvent: EventPayload?): Long? =
        when (domainEvent) {
            is PostLikedEvent -> domainEvent.likeId
            is PostUnlikedEvent -> domainEvent.likeId
            else -> null
        }

    private fun taskUid(
        domainEvent: EventPayload?,
        operationUid: UUID,
    ): UUID {
        val eventUid = domainEvent?.uid ?: return operationUid
        return UUID.nameUUIDFromBytes(
            "${PostInteractionSideEffectPayload.TASK_TYPE}:$eventUid".toByteArray(StandardCharsets.UTF_8),
        )
    }
}
