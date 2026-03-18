package com.back.boundedContexts.post.domain

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.*
import jakarta.persistence.GenerationType.SEQUENCE
import org.hibernate.annotations.DynamicUpdate

/**
 * PostLike는 비즈니스 상태와 규칙을 캡슐화하는 도메인 모델입니다.
 * 도메인 불변조건을 지키며 상태 변경을 메서드 단위로 통제합니다.
 */
@Entity
@DynamicUpdate
@Table(
    uniqueConstraints = [
        UniqueConstraint(columnNames = ["liker_id", "post_id"]),
    ],
)
class PostLike(
    @field:Id
    @field:SequenceGenerator(name = "post_like_seq_gen", sequenceName = "post_like_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "post_like_seq_gen")
    override val id: Int = 0,
    @field:ManyToOne(fetch = FetchType.LAZY)
    @field:JoinColumn(nullable = false)
    val liker: Member,
    @field:ManyToOne(fetch = FetchType.LAZY)
    @field:JoinColumn(nullable = false)
    val post: Post,
) : BaseTime(id)
