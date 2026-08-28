package com.back.boundedContexts.member.subContexts.notification.adapter.persistence

import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

interface MemberNotificationRepository : JpaRepository<MemberNotification, Long> {
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

    fun existsByEventUid(eventUid: UUID): Boolean

    @Modifying(clearAutomatically = false, flushAutomatically = true)
    @Transactional
    @Query(
        value = """
        delete from member_notification
        where id in (
            select id
            from member_notification
            where created_at < :cutoff
            order by created_at asc, id asc
            limit :limit
        )
        """,
        nativeQuery = true,
    )
    fun deleteCreatedBefore(
        @Param("cutoff") cutoff: Instant,
        @Param("limit") limit: Int,
    ): Int
}
