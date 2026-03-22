package com.back.global.security.application.port.output

import com.back.global.security.model.AuthSecurityEvent

/**
 * 인증 보안 이벤트 저장소 포트.
 * global application 계층은 구현체(adapter.persistence)에 직접 의존하지 않는다.
 */
interface AuthSecurityEventStore {
    fun save(event: AuthSecurityEvent)

    fun findRecent(limit: Int): List<AuthSecurityEvent>
}
