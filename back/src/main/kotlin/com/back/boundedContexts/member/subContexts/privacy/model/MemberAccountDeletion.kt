package com.back.boundedContexts.member.subContexts.privacy.model

import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType.SEQUENCE
import jakarta.persistence.Id
import jakarta.persistence.SequenceGenerator
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint
import java.time.Instant

@Entity
@Table(
    uniqueConstraints = [
        UniqueConstraint(name = "uk_member_account_deletion_member", columnNames = ["member_id"]),
    ],
)
class MemberAccountDeletion(
    @field:Id
    @field:SequenceGenerator(
        name = "member_account_deletion_seq_gen",
        sequenceName = "member_account_deletion_seq",
        allocationSize = 20,
    )
    @field:GeneratedValue(strategy = SEQUENCE, generator = "member_account_deletion_seq_gen")
    override val id: Long = 0,
    @field:Column(name = "member_id", nullable = false)
    val memberId: Long,
    @field:Column(length = 500)
    val reason: String? = null,
    @field:Column(nullable = false)
    val deletedAt: Instant,
) : BaseTime(id)
