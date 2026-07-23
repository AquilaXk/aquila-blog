package com.back.boundedContexts.member.subContexts.notification.application.service

import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.notification.application.port.output.MemberNotificationRepositoryPort
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotificationType
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationDto
import com.back.boundedContexts.post.application.port.output.PostCommentRepositoryPort
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import kotlin.jvm.optionals.getOrNull

@Service
class MemberNotificationApplicationService(
    private val memberRepository: MemberRepositoryPort,
    private val postCommentRepository: PostCommentRepositoryPort,
    private val memberNotificationRepository: MemberNotificationRepositoryPort,
    private val memberNotificationRealtimeRelayService: MemberNotificationRealtimeRelayService,
) {
    private val logger = LoggerFactory.getLogger(MemberNotificationApplicationService::class.java)

    data class NotificationSnapshot(
        val items: List<MemberNotificationDto>,
        val unreadCount: Int,
    )

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun createForCommentWritten(event: PostCommentWrittenEvent) {
        if (memberNotificationRepository.existsByEventUid(event.uid)) {
            return
        }

        val actorId = event.postCommentDto.authorId
        val receiverInfo = resolveReceiver(event) ?: return
        if (receiverInfo.receiverId == actorId) {
            return
        }

        val notification =
            memberNotificationRepository.save(
                MemberNotification(
                    receiver = memberRepository.getReferenceById(receiverInfo.receiverId),
                    actor = memberRepository.getReferenceById(actorId),
                    type = receiverInfo.type,
                    postId = event.postDto.id,
                    commentId = event.postCommentDto.id,
                    postTitle = normalizePostTitle(event.postDto.title),
                    commentPreview = normalizeCommentPreview(event.postCommentDto.content),
                    eventUid = event.uid,
                ),
            )

        val unreadCount = memberNotificationRepository.countUnreadByReceiverId(receiverInfo.receiverId).toInt()
        memberNotificationRealtimeRelayService.publish(
            memberId = receiverInfo.receiverId,
            notification = MemberNotificationDto(notification),
            unreadCount = unreadCount,
        )
    }

    @Transactional(readOnly = true)
    fun getLatest(member: Member): List<MemberNotificationDto> =
        memberNotificationRepository
            .findLatestByReceiverId(member.id)
            .mapNotNull { notification ->
                runCatching { MemberNotificationDto(notification) }
                    .onFailure { exception ->
                        logger.warn(
                            "notification_snapshot_item_skip receiverId={} notificationId={} reason={}",
                            member.id,
                            notification.id,
                            exception::class.java.simpleName,
                            exception,
                        )
                    }.getOrNull()
            }

    @Transactional(readOnly = true)
    fun unreadCount(member: Member): Int = memberNotificationRepository.countUnreadByReceiverId(member.id).toInt()

    @Transactional(readOnly = true)
    fun unreadCountSafe(member: Member): Int =
        runCatching { unreadCount(member) }
            .onFailure { exception ->
                logger.warn(
                    "notification_unread_count_fallback memberId={} reason={}",
                    member.id,
                    exception::class.java.simpleName,
                    exception,
                )
            }.getOrDefault(0)

    @Transactional(readOnly = true)
    fun getSnapshotSafe(member: Member): NotificationSnapshot {
        val items =
            runCatching { getLatest(member) }
                .onFailure { exception ->
                    logger.warn(
                        "notification_snapshot_items_fallback memberId={} reason={}",
                        member.id,
                        exception::class.java.simpleName,
                        exception,
                    )
                }.getOrDefault(emptyList())
        val unreadCount = unreadCountSafe(member)
        return NotificationSnapshot(items = items, unreadCount = unreadCount)
    }

    @Transactional
    fun markAllRead(member: Member): Int = memberNotificationRepository.markAllRead(member.id, java.time.Instant.now())

    @Transactional
    fun markRead(
        member: Member,
        id: Long,
    ): Boolean = memberNotificationRepository.markRead(id, member.id, java.time.Instant.now()) > 0

    private fun resolveReceiver(event: PostCommentWrittenEvent): ReceiverInfo? {
        val parentCommentId = event.postCommentDto.parentCommentId
        if (parentCommentId != null) {
            event.replyReceiverId?.let { return ReceiverInfo(it, MemberNotificationType.COMMENT_REPLY) }
            val parentComment = postCommentRepository.findById(parentCommentId).getOrNull() ?: return null
            return ReceiverInfo(parentComment.author.id, MemberNotificationType.COMMENT_REPLY)
        }

        return ReceiverInfo(event.postDto.authorId, MemberNotificationType.POST_COMMENT)
    }

    private fun normalizePostTitle(title: String): String = title.trim().ifBlank { "제목 없는 글" }.take(160)

    private fun normalizeCommentPreview(content: String): String =
        content
            .replace(Regex("\\s+"), " ")
            .trim()
            .take(240)

    private data class ReceiverInfo(
        val receiverId: Long,
        val type: MemberNotificationType,
    )
}
