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

/**
 * MemberNotificationApplicationService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
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

    /**
     * ForCommentWritten 항목을 생성한다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun createForCommentWritten(event: PostCommentWrittenEvent) {
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

    /**
     * markRead 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    @Transactional
    fun markRead(
        member: Member,
        id: Long,
    ): Boolean = memberNotificationRepository.markRead(id, member.id, java.time.Instant.now()) > 0

    /**
     * 실행 시점에 필요한 의존성/값을 결정합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun resolveReceiver(event: PostCommentWrittenEvent): ReceiverInfo? {
        val parentCommentId = event.postCommentDto.parentCommentId
        if (parentCommentId != null) {
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
