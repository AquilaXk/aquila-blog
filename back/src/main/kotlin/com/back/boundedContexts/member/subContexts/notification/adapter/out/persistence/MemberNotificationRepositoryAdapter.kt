package com.back.boundedContexts.member.subContexts.notification.adapter.out.persistence

import com.back.boundedContexts.member.subContexts.notification.application.port.out.MemberNotificationRepositoryPort
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class MemberNotificationRepositoryAdapter(
    private val memberNotificationRepository: MemberNotificationRepository,
) : MemberNotificationRepositoryPort {
    override fun save(notification: MemberNotification): MemberNotification = memberNotificationRepository.save(notification)

    override fun findLatestByReceiverId(receiverId: Int): List<MemberNotification> =
        memberNotificationRepository.findTop20ByReceiverIdOrderByCreatedAtDesc(receiverId)

    override fun countUnreadByReceiverId(receiverId: Int): Long = memberNotificationRepository.countByReceiverIdAndReadAtIsNull(receiverId)

    override fun markAllRead(
        receiverId: Int,
        readAt: Instant,
    ): Int = memberNotificationRepository.markAllRead(receiverId, readAt)

    override fun markRead(
        id: Int,
        receiverId: Int,
        readAt: Instant,
    ): Int = memberNotificationRepository.markRead(id, receiverId, readAt)
}
