package com.back.boundedContexts.post.domain.postMixin

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.exception.app.AppException
import com.back.global.rsData.RsData

interface PostHasPolicy : PostAware {
    fun canRead(actor: Member?): Boolean {
        if (!post.published) return actor?.id == post.author.id || actor?.isAdmin == true
        return true
    }

    fun checkActorCanRead(actor: Member?) {
        if (!canRead(actor)) throw AppException("403-3", "${post.id}번 글 조회권한이 없습니다.")
    }

    fun getCheckActorCanModifyRs(actor: Member?): RsData<Void> {
        if (actor == null) return RsData.fail("401-1", "로그인 후 이용해주세요.")
        if (actor == post.author) return RsData.OK
        return RsData.fail("403-1", "작성자만 글을 수정할 수 있습니다.")
    }

    fun checkActorCanModify(actor: Member?) {
        val rs = getCheckActorCanModifyRs(actor)
        if (rs.isFail) throw AppException(rs.resultCode, rs.msg)
    }

    fun getCheckActorCanDeleteRs(actor: Member?): RsData<Void> {
        if (actor == null) return RsData.fail("401-1", "로그인 후 이용해주세요.")
        if (actor.isAdmin) return RsData.OK
        if (actor == post.author) return RsData.OK
        return RsData.fail("403-2", "작성자만 글을 삭제할 수 있습니다.")
    }

    fun checkActorCanDelete(actor: Member?) {
        val rs = getCheckActorCanDeleteRs(actor)
        if (rs.isFail) throw AppException(rs.resultCode, rs.msg)
    }
}
