package com.back.boundedContexts.member.application.port.output

import com.back.boundedContexts.member.domain.shared.Member
import java.util.Optional

interface MemberRepositoryPort {
    data class PagedQuery(
        val kw: String,
        val zeroBasedPage: Int,
        val pageSize: Int,
        val sortProperty: String,
        val sortAscending: Boolean,
    )

    data class PagedResult<T>(
        val content: List<T>,
        val totalElements: Long,
    )

    fun count(): Long

    fun save(member: Member): Member

    fun saveAndFlush(member: Member): Member

    fun existsByEmail(email: String): Boolean

    fun findByLoginId(loginId: String): Member?

    fun findByEmail(email: String): Member?

    fun findByApiKey(apiKey: String): Member?

    fun findById(id: Long): Optional<Member>

    fun findByIdForUpdate(id: Long): Optional<Member>

    fun getReferenceById(id: Long): Member

    fun findQPagedByKw(query: PagedQuery): PagedResult<Member>
}
