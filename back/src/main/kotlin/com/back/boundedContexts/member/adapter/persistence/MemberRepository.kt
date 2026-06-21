package com.back.boundedContexts.member.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import jakarta.persistence.LockModeType
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.util.Optional

interface MemberRepository :
    JpaRepository<Member, Long>,
    MemberRepositoryCustom {
    fun existsByEmail(email: String): Boolean

    fun findByApiKey(apiKey: String): Member?

    fun findByEmail(email: String): Member?

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select member from Member member where member.id = :id")
    fun findByIdForUpdate(
        @Param("id") id: Long,
    ): Optional<Member>

    override fun findAll(pageable: Pageable): Page<Member>
}
