package com.back.boundedContexts.member.subContexts.notification.adapter.out.persistence

import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import org.springframework.data.jpa.repository.EntityGraph
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.time.Instant

interface MemberNotificationRepository : JpaRepository<MemberNotification, Int> {
    @EntityGraph(attributePaths = ["actor"])
    fun findTop20ByReceiverIdOrderByCreatedAtDesc(receiverId: Int): List<MemberNotification>

    fun countByReceiverIdAndReadAtIsNull(receiverId: Int): Long

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
        @Param("receiverId") receiverId: Int,
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
        @Param("id") id: Int,
        @Param("receiverId") receiverId: Int,
        @Param("readAt") readAt: Instant,
    ): Int
}
