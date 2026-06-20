package com.back.boundedContexts.member.subContexts.notification.application.port.output

import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import java.time.Instant
import java.util.UUID

interface MemberNotificationRepositoryPort {
    fun save(notification: MemberNotification): MemberNotification

    fun findLatestByReceiverId(receiverId: Long): List<MemberNotification>

    fun findByReceiverIdAndIdGreaterThan(
        receiverId: Long,
        lastNotificationId: Long,
        limit: Int,
    ): List<MemberNotification>

    fun countUnreadByReceiverId(receiverId: Long): Long

    fun existsByEventUid(eventUid: UUID): Boolean

    fun markAllRead(
        receiverId: Long,
        readAt: Instant,
    ): Int

    fun markRead(
        id: Long,
        receiverId: Long,
        readAt: Instant,
    ): Int
}
