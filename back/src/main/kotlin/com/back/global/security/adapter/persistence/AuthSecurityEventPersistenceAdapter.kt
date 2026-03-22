package com.back.global.security.adapter.persistence

import com.back.global.security.application.port.output.AuthSecurityEventStore
import com.back.global.security.model.AuthSecurityEvent
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.stereotype.Component

@Component
class AuthSecurityEventPersistenceAdapter(
    private val authSecurityEventRepository: AuthSecurityEventRepository,
) : AuthSecurityEventStore {
    override fun save(event: AuthSecurityEvent) {
        authSecurityEventRepository.save(event)
    }

    override fun findRecent(limit: Int): List<AuthSecurityEvent> {
        val normalizedLimit = limit.coerceIn(1, 100)
        val pageable =
            PageRequest.of(
                0,
                normalizedLimit,
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")),
            )

        return authSecurityEventRepository.findAll(pageable).content
    }
}
