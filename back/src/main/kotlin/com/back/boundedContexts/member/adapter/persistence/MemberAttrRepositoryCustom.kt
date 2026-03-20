package com.back.boundedContexts.member.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr

/**
 * `MemberAttrRepositoryCustom` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface MemberAttrRepositoryCustom {
    fun findBySubjectAndName(
        subject: Member,
        name: String,
    ): MemberAttr?

    fun findBySubjectInAndNameIn(
        subjects: List<Member>,
        names: List<String>,
    ): List<MemberAttr>

    fun existsByNameAndStrValue(
        name: String,
        strValue: String,
    ): Boolean

    fun existsByNameAndStrValueContaining(
        name: String,
        valueFragment: String,
    ): Boolean

    fun existsBySubjectIdAndNameAndStrValueContaining(
        subjectId: Long,
        name: String,
        valueFragment: String,
    ): Boolean

    fun incrementIntValue(
        subject: Member,
        name: String,
        delta: Int = 1,
    ): Int
}
