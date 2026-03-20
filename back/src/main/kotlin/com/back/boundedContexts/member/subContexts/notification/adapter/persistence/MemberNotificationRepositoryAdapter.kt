package com.back.boundedContexts.member.subContexts.notification.adapter.persistence

import com.back.boundedContexts.member.subContexts.notification.application.port.output.MemberNotificationRepositoryPort
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Component
import java.time.Instant

/**
 * MemberNotificationRepositoryAdapter는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
@Component
class MemberNotificationRepositoryAdapter(
    private val memberNotificationRepository: MemberNotificationRepository,
) : MemberNotificationRepositoryPort {
    override fun save(notification: MemberNotification): MemberNotification = memberNotificationRepository.save(notification)

    override fun findLatestByReceiverId(receiverId: Long): List<MemberNotification> =
        memberNotificationRepository.findLatestByReceiverId(receiverId, PageRequest.of(0, 20))

    override fun findByReceiverIdAndIdGreaterThan(
        receiverId: Long,
        lastNotificationId: Long,
        limit: Int,
    ): List<MemberNotification> =
        memberNotificationRepository.findByReceiverIdAndIdGreaterThan(
            receiverId,
            lastNotificationId,
            PageRequest.of(0, limit),
        )

    override fun countUnreadByReceiverId(receiverId: Long): Long = memberNotificationRepository.countByReceiverIdAndReadAtIsNull(receiverId)

    override fun markAllRead(
        receiverId: Long,
        readAt: Instant,
    ): Int = memberNotificationRepository.markAllRead(receiverId, readAt)

    override fun markRead(
        id: Long,
        receiverId: Long,
        readAt: Instant,
    ): Int = memberNotificationRepository.markRead(id, receiverId, readAt)
}
