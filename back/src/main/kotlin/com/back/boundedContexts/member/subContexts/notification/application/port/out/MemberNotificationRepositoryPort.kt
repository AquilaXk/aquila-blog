package com.back.boundedContexts.member.subContexts.notification.application.port.out

import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import java.time.Instant

interface MemberNotificationRepositoryPort {
    fun save(notification: MemberNotification): MemberNotification

    fun findLatestByReceiverId(receiverId: Int): List<MemberNotification>

    fun countUnreadByReceiverId(receiverId: Int): Long

    fun markAllRead(
        receiverId: Int,
        readAt: Instant,
    ): Int

    fun markRead(
        id: Int,
        receiverId: Int,
        readAt: Instant,
    ): Int
}
