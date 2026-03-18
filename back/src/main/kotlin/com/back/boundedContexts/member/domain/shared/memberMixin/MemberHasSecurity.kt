package com.back.boundedContexts.member.domain.shared.memberMixin

import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority

/**
 * MemberHasSecurity는 비즈니스 상태와 규칙을 캡슐화하는 도메인 모델입니다.
 * 도메인 불변조건을 지키며 상태 변경을 메서드 단위로 통제합니다.
 */
interface MemberHasSecurity : MemberAware {
    val authoritiesAsStringList: List<String>
        get() =
            buildList {
                add("ROLE_MEMBER")
                if (member.isAdmin) add("ROLE_ADMIN")
            }

    val authorities: Collection<GrantedAuthority>
        get() = authoritiesAsStringList.map(::SimpleGrantedAuthority)
}
