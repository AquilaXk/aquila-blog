package com.back.boundedContexts.post.domain.postMixin

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.exception.application.AppException
import com.back.global.rsData.RsData

/**
 * `PostHasPolicy` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface PostHasPolicy : PostAware {
    /**
     * 권한/상태 조건을 검증하고 처리 가능 여부를 판정합니다.
     * 도메인 계층에서 불변조건을 지키며 상태 전이를 캡슐화합니다.
     */
    fun canRead(actor: Member?): Boolean {
        if (!post.published) return actor?.id == post.author.id || actor?.isAdmin == true
        return true
    }

    /**
     * 검증 규칙을 적용해 허용 여부를 판정합니다.
     * 도메인 모델 내부에서 불변조건을 지키며 상태 변경을 캡슐화합니다.
     */
    fun checkActorCanRead(actor: Member?) {
        if (!canRead(actor)) throw AppException("403-3", "${post.id}번 글 조회권한이 없습니다.")
    }

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 도메인 계층에서 불변조건을 지키며 상태 전이를 캡슐화합니다.
     */
    fun getCheckActorCanModifyRs(actor: Member?): RsData<Void> {
        if (actor == null) return RsData.fail("401-1", "로그인 후 이용해주세요.")
        if (actor.isAdmin) return RsData.OK
        if (actor.id == post.author.id) return RsData.OK
        return RsData.fail("403-1", "작성자만 글을 수정할 수 있습니다.")
    }

    /**
     * 검증 규칙을 적용해 허용 여부를 판정합니다.
     * 도메인 모델 내부에서 불변조건을 지키며 상태 변경을 캡슐화합니다.
     */
    fun checkActorCanModify(actor: Member?) {
        val rs = getCheckActorCanModifyRs(actor)
        if (rs.isFail) throw AppException(rs.resultCode, rs.msg)
    }

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 도메인 계층에서 불변조건을 지키며 상태 전이를 캡슐화합니다.
     */
    fun getCheckActorCanDeleteRs(actor: Member?): RsData<Void> {
        if (actor == null) return RsData.fail("401-1", "로그인 후 이용해주세요.")
        if (actor.isAdmin) return RsData.OK
        if (actor.id == post.author.id) return RsData.OK
        return RsData.fail("403-2", "작성자만 글을 삭제할 수 있습니다.")
    }

    /**
     * 검증 규칙을 적용해 허용 여부를 판정합니다.
     * 도메인 모델 내부에서 불변조건을 지키며 상태 변경을 캡슐화합니다.
     */
    fun checkActorCanDelete(actor: Member?) {
        val rs = getCheckActorCanDeleteRs(actor)
        if (rs.isFail) throw AppException(rs.resultCode, rs.msg)
    }
}
