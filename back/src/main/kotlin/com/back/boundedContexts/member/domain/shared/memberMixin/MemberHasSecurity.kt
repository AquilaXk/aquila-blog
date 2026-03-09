package com.back.boundedContexts.member.domain.shared.memberMixin

import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority

interface MemberHasSecurity : MemberAware {
    val authoritiesAsStringList: List<String>
        get() = buildList {
            add("ROLE_MEMBER")
            if (member.isAdmin) add("ROLE_ADMIN")
        }

    val authorities: Collection<GrantedAuthority>
        get() = authoritiesAsStringList.map(::SimpleGrantedAuthority)
}
