package com.back.boundedContexts.post.domain

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.*
import jakarta.persistence.GenerationType.SEQUENCE
import org.hibernate.annotations.DynamicUpdate

@Entity
@DynamicUpdate
@Table(
    uniqueConstraints = [
        UniqueConstraint(columnNames = ["liker_id", "post_id"])
    ]
)
class PostLike(
    @field:Id
    @field:SequenceGenerator(name = "post_like_seq_gen", sequenceName = "post_like_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "post_like_seq_gen")
    override val id: Int = 0,

    @field:ManyToOne(fetch = FetchType.LAZY)
    @field:JoinColumn(name = "liker_id", nullable = false)
    val liker: Member,

    @field:ManyToOne(fetch = FetchType.LAZY)
    @field:JoinColumn(nullable = false)
    val post: Post,
) : BaseTime(id)
