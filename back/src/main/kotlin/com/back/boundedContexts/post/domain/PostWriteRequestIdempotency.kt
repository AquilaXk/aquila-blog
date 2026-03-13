package com.back.boundedContexts.post.domain

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType.SEQUENCE
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.SequenceGenerator
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint

@Entity
@Table(
    name = "post_write_request_idempotency",
    uniqueConstraints = [
        UniqueConstraint(
            name = "uk_post_write_request_idempotency_actor_key",
            columnNames = ["actor_id", "request_key"],
        ),
    ],
)
class PostWriteRequestIdempotency(
    @field:Id
    @field:SequenceGenerator(
        name = "post_write_request_idempotency_seq_gen",
        sequenceName = "post_write_request_idempotency_seq",
        allocationSize = 50,
    )
    @field:GeneratedValue(strategy = SEQUENCE, generator = "post_write_request_idempotency_seq_gen")
    override val id: Int = 0,
    @field:ManyToOne(fetch = FetchType.LAZY)
    @field:JoinColumn(name = "actor_id", nullable = false)
    val actor: Member,
    @field:Column(name = "request_key", nullable = false, length = 120)
    val requestKey: String,
    @field:Column(name = "post_id")
    var postId: Int? = null,
) : BaseTime(id)
