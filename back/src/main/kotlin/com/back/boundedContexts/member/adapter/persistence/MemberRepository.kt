package com.back.boundedContexts.member.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository

/**
 * `MemberRepository` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface MemberRepository :
    JpaRepository<Member, Long>,
    MemberRepositoryCustom {
    fun existsByEmail(email: String): Boolean

    fun findByApiKey(apiKey: String): Member?

    fun findByEmail(email: String): Member?

    override fun findAll(pageable: Pageable): Page<Member>
}
