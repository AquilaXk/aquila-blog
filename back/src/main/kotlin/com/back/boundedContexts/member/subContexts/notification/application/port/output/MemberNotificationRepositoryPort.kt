package com.back.boundedContexts.member.subContexts.notification.application.port.output

import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import java.time.Instant

/**
 * `MemberNotificationRepositoryPort` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface MemberNotificationRepositoryPort {
    fun save(notification: MemberNotification): MemberNotification

    fun findLatestByReceiverId(receiverId: Long): List<MemberNotification>

    fun findByReceiverIdAndIdGreaterThan(
        receiverId: Long,
        lastNotificationId: Long,
        limit: Int,
    ): List<MemberNotification>

    fun countUnreadByReceiverId(receiverId: Long): Long

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
