package com.back.boundedContexts.post.domain

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

@Entity
@DynamicUpdate
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
) : BaseTime(id), PostCommentHasPolicy {
    override val postComment get() = this

    fun modify(content: String) {
        this.content = content
    }

    val isReply: Boolean
        get() = parentComment != null
}
