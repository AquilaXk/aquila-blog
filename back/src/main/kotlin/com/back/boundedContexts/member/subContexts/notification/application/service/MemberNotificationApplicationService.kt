package com.back.boundedContexts.member.subContexts.notification.application.service

import com.back.boundedContexts.member.application.port.out.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.notification.application.port.out.MemberNotificationRepositoryPort
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotificationType
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationDto
import com.back.boundedContexts.post.application.port.out.PostCommentRepositoryPort
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import kotlin.jvm.optionals.getOrNull

@Service
class MemberNotificationApplicationService(
    private val memberRepository: MemberRepositoryPort,
    private val postCommentRepository: PostCommentRepositoryPort,
    private val memberNotificationRepository: MemberNotificationRepositoryPort,
    private val memberNotificationSseService: MemberNotificationSseService,
) {
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
        memberNotificationSseService.publish(
            memberId = receiverInfo.receiverId,
            notification = MemberNotificationDto(notification),
            unreadCount = unreadCount,
        )
    }

    @Transactional(readOnly = true)
    fun getLatest(member: Member): List<MemberNotificationDto> =
        memberNotificationRepository
            .findLatestByReceiverId(member.id)
            .map(::MemberNotificationDto)

    @Transactional(readOnly = true)
    fun unreadCount(member: Member): Int = memberNotificationRepository.countUnreadByReceiverId(member.id).toInt()

    @Transactional
    fun markAllRead(member: Member): Int = memberNotificationRepository.markAllRead(member.id, java.time.Instant.now())

    @Transactional
    fun markRead(
        member: Member,
        id: Int,
    ): Boolean = memberNotificationRepository.markRead(id, member.id, java.time.Instant.now()) > 0

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
        val receiverId: Int,
        val type: MemberNotificationType,
    )
}
