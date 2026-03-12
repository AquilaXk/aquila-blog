package com.back.boundedContexts.member.application.port.out

import com.back.boundedContexts.member.domain.shared.Member
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import java.util.Optional

interface MemberRepositoryPort {
    fun count(): Long

    fun save(member: Member): Member

    fun saveAndFlush(member: Member): Member

    fun existsByEmail(email: String): Boolean

    fun findByUsername(username: String): Member?

    fun findByEmail(email: String): Member?

    fun findByApiKey(apiKey: String): Member?

    fun findById(id: Int): Optional<Member>

    fun getReferenceById(id: Int): Member

    fun findQPagedByKw(
        kw: String,
        pageable: Pageable,
    ): Page<Member>
}
