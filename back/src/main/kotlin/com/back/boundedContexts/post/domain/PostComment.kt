package com.back.boundedContexts.post.domain

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.exception.app.AppException
import com.back.global.jpa.domain.BaseTime
import com.back.global.rsData.RsData
import jakarta.persistence.*
import jakarta.persistence.GenerationType.SEQUENCE
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
) : BaseTime(id) {
    fun modify(content: String) {
        this.content = content
    }

    fun getCheckActorCanModifyRs(actor: Member?): RsData<Void> {
        if (actor == null) return RsData.fail("401-1", "로그인 후 이용해주세요.")
        if (actor == author) return RsData.OK
        return RsData.fail("403-1", "작성자만 댓글을 수정할 수 있습니다.")
    }

    fun checkActorCanModify(actor: Member?) {
        val rs = getCheckActorCanModifyRs(actor)
        if (rs.isFail) throw AppException(rs.resultCode, rs.msg)
    }

    fun getCheckActorCanDeleteRs(actor: Member?): RsData<Void> {
        if (actor == null) return RsData.fail("401-1", "로그인 후 이용해주세요.")
        if (actor.isAdmin) return RsData.OK
        if (actor == author) return RsData.OK
        return RsData.fail("403-2", "작성자만 댓글을 삭제할 수 있습니다.")
    }

    fun checkActorCanDelete(actor: Member?) {
        val rs = getCheckActorCanDeleteRs(actor)
        if (rs.isFail) throw AppException(rs.resultCode, rs.msg)
    }
}
