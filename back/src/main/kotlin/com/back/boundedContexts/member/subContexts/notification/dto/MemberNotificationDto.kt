package com.back.boundedContexts.member.subContexts.notification.dto

import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotificationType
import java.time.Instant

data class MemberNotificationDto(
    val id: Int,
    val type: MemberNotificationType,
    val createdAt: Instant,
    val actorId: Int,
    val actorName: String,
    val actorProfileImageUrl: String,
    val postId: Int,
    val commentId: Int,
    val postTitle: String,
    val commentPreview: String,
    val message: String,
    val isRead: Boolean,
) {
    constructor(notification: MemberNotification) : this(
        id = notification.id,
        type = notification.type,
        createdAt = notification.createdAt,
        actorId = notification.actor.id,
        actorName = notification.actor.name,
        actorProfileImageUrl = notification.actor.redirectToProfileImgUrlVersionedOrDefault,
        postId = notification.postId,
        commentId = notification.commentId,
        postTitle = notification.postTitle,
        commentPreview = notification.commentPreview,
        message = buildMessage(notification),
        isRead = notification.isRead,
    )

    companion object {
        private fun buildMessage(notification: MemberNotification): String =
            when (notification.type) {
                MemberNotificationType.COMMENT_REPLY -> "${notification.actor.name}님이 회원님의 댓글에 답글을 남겼습니다."
                MemberNotificationType.POST_COMMENT -> "${notification.actor.name}님이 회원님의 글에 댓글을 남겼습니다."
            }
    }
}
