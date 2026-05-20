package com.back.global.security.adapter.persistence

import com.back.global.security.model.AuthSecurityEvent
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant

interface AuthSecurityEventRepository : JpaRepository<AuthSecurityEvent, Long> {
    fun findByCreatedAtBefore(
        cutoff: Instant,
        pageable: Pageable,
    ): List<AuthSecurityEvent>
}
