package com.back.boundedContexts.post.model

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.postCommentMixin.PostCommentHasPolicy
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
import org.hibernate.annotations.DynamicUpdate
import org.hibernate.annotations.SQLRestriction
import java.time.Instant

/**
 * PostComment는 비즈니스 상태와 규칙을 캡슐화하는 도메인 모델입니다.
 * 도메인 불변조건을 지키며 상태 변경을 메서드 단위로 통제합니다.
 */
@Entity
@DynamicUpdate
@SQLRestriction("deleted_at IS NULL")
class PostComment(
    @field:Id
    @field:SequenceGenerator(name = "post_comment_seq_gen", sequenceName = "post_comment_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "post_comment_seq_gen")
    override val id: Int = 0,
    @field:ManyToOne(fetch = FetchType.LAZY)
    @field:JoinColumn(nullable = false)
    val author: Member,
    @field:ManyToOne(fetch = FetchType.LAZY)
    @field:JoinColumn(nullable = false)
    val post: Post,
    @field:Column(nullable = false)
    var content: String,
    @field:ManyToOne(fetch = FetchType.LAZY)
    @field:JoinColumn(name = "parent_comment_id")
    val parentComment: PostComment? = null,
) : BaseTime(id),
    PostCommentHasPolicy {
    @field:Column
    var deletedAt: Instant? = null

    override val postComment get() = this

    fun modify(content: String) {
        this.content = content
    }

    fun softDelete() {
        deletedAt = Instant.now()
    }

    val isReply: Boolean
        get() = parentComment != null
}
