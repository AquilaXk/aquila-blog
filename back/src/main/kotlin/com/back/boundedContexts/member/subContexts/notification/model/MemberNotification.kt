package com.back.boundedContexts.member.subContexts.notification.model

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotificationType
import com.back.global.jpa.domain.AfterDDL
import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType.SEQUENCE
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.SequenceGenerator
import java.time.Instant

/**
 * MemberNotification는 비즈니스 상태와 규칙을 캡슐화하는 도메인 모델입니다.
 * 도메인 불변조건을 지키며 상태 변경을 메서드 단위로 통제합니다.
 */
@Entity
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS member_notification_idx_receiver_created_at_desc
    ON member_notification (receiver_id, created_at DESC)
    """,
)
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS member_notification_idx_receiver_unread_created_at_desc
    ON member_notification (receiver_id, read_at, created_at DESC)
    """,
)
class MemberNotification(
    @field:Id
    @field:SequenceGenerator(
        name = "member_notification_seq_gen",
        sequenceName = "member_notification_seq",
        allocationSize = 50,
    )
    @field:GeneratedValue(strategy = SEQUENCE, generator = "member_notification_seq_gen")
    override val id: Long = 0,
    @field:ManyToOne(fetch = FetchType.LAZY)
    @field:JoinColumn(nullable = false)
    val receiver: Member,
    @field:ManyToOne(fetch = FetchType.LAZY)
    @field:JoinColumn(nullable = false)
    val actor: Member,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 40)
    val type: MemberNotificationType,
    @field:Column(nullable = false)
    val postId: Long,
    @field:Column(nullable = false)
    val commentId: Long,
    @field:Column(nullable = false, length = 160)
    val postTitle: String,
    @field:Column(nullable = false, length = 240)
    val commentPreview: String,
) : BaseTime(id) {
    @field:Column
    var readAt: Instant? = null

    fun markRead(now: Instant = Instant.now()) {
        if (readAt == null) {
            readAt = now
        }
    }

    val isRead: Boolean
        get() = readAt != null
}
