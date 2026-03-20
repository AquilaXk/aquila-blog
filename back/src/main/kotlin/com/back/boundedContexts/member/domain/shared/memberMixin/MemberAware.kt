package com.back.boundedContexts.member.domain.shared.memberMixin

import com.back.boundedContexts.member.domain.shared.Member

/**
 * `MemberAware` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface MemberAware {
    val id: Long
    val name: String
    val member: Member
}
