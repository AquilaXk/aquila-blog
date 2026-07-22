package com.back.boundedContexts.post.domain.postCommentMixin

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.rsData.RsData

interface PostCommentHasPolicy : PostCommentAware {
    fun getCheckActorCanModifyRs(actor: Member?): RsData<Void> {
        if (actor == null) return RsData.fail(ErrorCode.UNAUTHORIZED, "로그인 후 이용해주세요.")
        if (actor == postComment.author) return RsData.OK
        return RsData.fail(ErrorCode.POST_COMMENT_EDIT_DENIED, "작성자만 댓글을 수정할 수 있습니다.")
    }

    fun checkActorCanModify(actor: Member?) {
        val rs = getCheckActorCanModifyRs(actor)
        if (rs.isFail) throw AppException(ErrorCode.fromCode(rs.resultCode), rs.msg)
    }

    fun getCheckActorCanDeleteRs(actor: Member?): RsData<Void> {
        if (actor == null) return RsData.fail(ErrorCode.UNAUTHORIZED, "로그인 후 이용해주세요.")
        if (actor.isAdmin) return RsData.OK
        if (actor == postComment.author) return RsData.OK
        return RsData.fail(ErrorCode.POST_COMMENT_DELETE_DENIED, "작성자만 댓글을 삭제할 수 있습니다.")
    }

    fun checkActorCanDelete(actor: Member?) {
        val rs = getCheckActorCanDeleteRs(actor)
        if (rs.isFail) throw AppException(ErrorCode.fromCode(rs.resultCode), rs.msg)
    }
}
