package com.back.boundedContexts.member.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member

interface MemberRepositoryCustom {
    fun findByLoginId(loginId: String): Member?
}
