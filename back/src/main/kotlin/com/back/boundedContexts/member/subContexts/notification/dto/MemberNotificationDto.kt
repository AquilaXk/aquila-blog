package com.back.boundedContexts.member.subContexts.notification.dto

import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotificationType
import java.time.Instant

/**
 * `MemberNotificationDto` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
data class MemberNotificationDto(
    val id: Long,
    val type: MemberNotificationType,
    val createdAt: Instant,
    val actorId: Long,
    val actorName: String,
    val actorProfileImageUrl: String,
    val postId: Long,
    val commentId: Long,
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
