package com.back.boundedContexts.member.subContexts.notification.application.port.output

import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import java.time.Instant
import java.util.UUID

interface MemberNotificationRepositoryPort {
    fun save(notification: MemberNotification): MemberNotification

    fun findByReceiverIdAndIdGreaterThan(
        receiverId: Long,
        lastNotificationId: Long,
        limit: Int,
    ): List<MemberNotification>

    fun countUnreadByReceiverId(receiverId: Long): Long

    fun existsByEventUid(eventUid: UUID): Boolean

    fun deleteCreatedBefore(
        cutoff: Instant,
        limit: Int,
    ): Int
}
