package com.back.global.security.adapter.persistence

import com.back.global.security.model.AuthSecurityEvent
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.time.Instant

interface AuthSecurityEventRepository : JpaRepository<AuthSecurityEvent, Long> {
    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Query(
        value = """
        delete from auth_security_event
        where id in (
            select id
            from auth_security_event
            where created_at < :cutoff
            order by created_at asc, id asc
            limit :limit
        )
        """,
        nativeQuery = true,
    )
    fun deleteExpiredBefore(
        @Param("cutoff") cutoff: Instant,
        @Param("limit") limit: Int,
    ): Int
}
