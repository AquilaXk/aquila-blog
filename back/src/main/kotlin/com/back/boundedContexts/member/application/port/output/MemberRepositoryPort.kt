package com.back.boundedContexts.member.application.port.output

import com.back.boundedContexts.member.domain.shared.Member
import java.util.Optional

/**
 * `MemberRepositoryPort` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
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

    fun findByUsername(username: String): Member?

    fun findByEmail(email: String): Member?

    fun findByApiKey(apiKey: String): Member?

    fun findById(id: Long): Optional<Member>

    fun getReferenceById(id: Long): Member

    fun findQPagedByKw(query: PagedQuery): PagedResult<Member>
}
