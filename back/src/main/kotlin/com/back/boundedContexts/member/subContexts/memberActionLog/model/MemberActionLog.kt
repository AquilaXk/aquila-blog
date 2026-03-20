package com.back.boundedContexts.member.subContexts.memberActionLog.model

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.jpa.domain.BaseEntity
import jakarta.persistence.*
import jakarta.persistence.GenerationType.SEQUENCE
import org.hibernate.annotations.DynamicUpdate

/**
 * MemberActionLog는 비즈니스 상태와 규칙을 캡슐화하는 도메인 모델입니다.
 * 도메인 불변조건을 지키며 상태 변경을 메서드 단위로 통제합니다.
 */
@Entity
@DynamicUpdate
class MemberActionLog(
    @field:Id
    @field:SequenceGenerator(name = "member_action_log_seq_gen", sequenceName = "member_action_log_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "member_action_log_seq_gen")
    override val id: Long = 0,
    val type: String,
    val primaryType: String,
    val primaryId: Long,
    @field:ManyToOne(fetch = FetchType.LAZY) val primaryOwner: Member,
    val secondaryType: String,
    val secondaryId: Long,
    @field:ManyToOne(fetch = FetchType.LAZY) val secondaryOwner: Member,
    @field:ManyToOne(fetch = FetchType.LAZY) val actor: Member,
    @field:Column(columnDefinition = "TEXT") val data: String,
) : BaseEntity()
