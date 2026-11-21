package com.back.global.security.domain

import com.back.boundedContexts.member.domain.shared.Member
import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority

fun Member.toGrantedAuthorities(): Collection<GrantedAuthority> =
    buildList {
        add(SimpleGrantedAuthority("ROLE_MEMBER"))
        if (isAdmin) add(SimpleGrantedAuthority("ROLE_ADMIN"))
    }
