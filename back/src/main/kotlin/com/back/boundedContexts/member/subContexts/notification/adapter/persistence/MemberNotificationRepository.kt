package com.back.boundedContexts.member.subContexts.notification.adapter.persistence

import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.time.Instant

/**
 * `MemberNotificationRepository` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface MemberNotificationRepository : JpaRepository<MemberNotification, Long> {
    @Query(
        """
        SELECT notification
        FROM MemberNotification notification
        JOIN FETCH notification.actor actor
        WHERE notification.receiver.id = :receiverId
        ORDER BY notification.createdAt DESC
        """,
    )
    fun findLatestByReceiverId(
        @Param("receiverId") receiverId: Long,
        pageable: Pageable,
    ): List<MemberNotification>

    @Query(
        """
        SELECT notification
        FROM MemberNotification notification
        JOIN FETCH notification.actor actor
        WHERE notification.receiver.id = :receiverId
          AND notification.id > :id
        ORDER BY notification.id ASC
        """,
    )
    fun findByReceiverIdAndIdGreaterThan(
        @Param("receiverId") receiverId: Long,
        @Param("id") id: Long,
        pageable: Pageable,
    ): List<MemberNotification>

    fun countByReceiverIdAndReadAtIsNull(receiverId: Long): Long

    @Modifying(clearAutomatically = false, flushAutomatically = true)
    @Query(
        """
        UPDATE MemberNotification notification
        SET notification.readAt = :readAt
        WHERE notification.receiver.id = :receiverId
          AND notification.readAt IS NULL
        """,
    )
    fun markAllRead(
        @Param("receiverId") receiverId: Long,
        @Param("readAt") readAt: Instant,
    ): Int

    @Modifying(clearAutomatically = false, flushAutomatically = true)
    @Query(
        """
        UPDATE MemberNotification notification
        SET notification.readAt = :readAt
        WHERE notification.id = :id
          AND notification.receiver.id = :receiverId
          AND notification.readAt IS NULL
        """,
    )
    fun markRead(
        @Param("id") id: Long,
        @Param("receiverId") receiverId: Long,
        @Param("readAt") readAt: Instant,
    ): Int
}
