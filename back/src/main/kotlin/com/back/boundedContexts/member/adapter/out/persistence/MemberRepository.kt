package com.back.boundedContexts.member.adapter.out.persistence

import com.back.boundedContexts.member.domain.shared.Member
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository

interface MemberRepository :
    JpaRepository<Member, Int>,
    MemberRepositoryCustom {
    fun existsByEmail(email: String): Boolean

    fun findByApiKey(apiKey: String): Member?

    fun findByEmail(email: String): Member?

    override fun findAll(pageable: Pageable): Page<Member>
}
