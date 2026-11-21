package com.back.boundedContexts.post.domain.postMixin

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.rsData.RsData

interface PostHasPolicy : PostAware {
    /**
     * 권한/상태 조건을 검증하고 처리 가능 여부를 판정합니다.
     * 도메인 계층에서 불변조건을 지키며 상태 전이를 캡슐화합니다.
     */
    fun canRead(actor: Member?): Boolean {
        if (!post.published) return actor?.id == post.author.id || actor?.isAdmin == true
        return true
    }

    fun checkActorCanRead(actor: Member?) {
        if (!canRead(actor)) throw AppException(ErrorCode.POST_VIEW_DENIED, "${post.id}번 글 조회권한이 없습니다.")
    }

    fun getCheckActorCanModifyRs(actor: Member?): RsData<Void> {
        if (actor == null) return RsData.fail(ErrorCode.UNAUTHORIZED, "로그인 후 이용해주세요.")
        if (actor.isAdmin) return RsData.OK
        if (actor.id == post.author.id) return RsData.OK
        return RsData.fail(ErrorCode.POST_EDIT_DENIED, "작성자만 글을 수정할 수 있습니다.")
    }

    fun checkActorCanModify(actor: Member?) {
        val rs = getCheckActorCanModifyRs(actor)
        if (rs.isFail) throw AppException(ErrorCode.fromCode(rs.resultCode), rs.msg)
    }

    fun getCheckActorCanDeleteRs(actor: Member?): RsData<Void> {
        if (actor == null) return RsData.fail(ErrorCode.UNAUTHORIZED, "로그인 후 이용해주세요.")
        if (actor.isAdmin) return RsData.OK
        if (actor.id == post.author.id) return RsData.OK
        return RsData.fail(ErrorCode.POST_DELETE_DENIED, "작성자만 글을 삭제할 수 있습니다.")
    }

    fun checkActorCanDelete(actor: Member?) {
        val rs = getCheckActorCanDeleteRs(actor)
        if (rs.isFail) throw AppException(ErrorCode.fromCode(rs.resultCode), rs.msg)
    }
}
