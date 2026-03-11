package com.back.boundedContexts.member.adapter.out.persistence

import com.back.boundedContexts.member.domain.shared.Member
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable

interface MemberRepositoryCustom {
    fun findByUsername(username: String): Member?

    fun findQPagedByKw(
        kw: String,
        pageable: Pageable,
    ): Page<Member>
}
