package com.back.boundedContexts.member.subContexts.memberActionLog.domain

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.jpa.domain.BaseEntity
import jakarta.persistence.*
import jakarta.persistence.GenerationType.SEQUENCE
import org.hibernate.annotations.DynamicUpdate

@Entity
@DynamicUpdate
class MemberActionLog(
    @field:Id
    @field:SequenceGenerator(name = "member_action_log_seq_gen", sequenceName = "member_action_log_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "member_action_log_seq_gen")
    override val id: Int = 0,

    val type: String,
    val primaryType: String,
    val primaryId: Int,
    @field:ManyToOne(fetch = FetchType.LAZY) val primaryOwner: Member,
    val secondaryType: String,
    val secondaryId: Int,
    @field:ManyToOne(fetch = FetchType.LAZY) val secondaryOwner: Member,
    @field:ManyToOne(fetch = FetchType.LAZY) val actor: Member,
    @field:Column(columnDefinition = "TEXT") val data: String,
) : BaseEntity()
