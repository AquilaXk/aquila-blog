package com.back.global.security.application

import com.back.global.security.application.port.output.AuthSecurityEventStore
import com.back.global.security.domain.AuthSecurityEventType
import com.back.global.security.model.AuthSecurityEvent
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.temporal.ChronoUnit

@DisplayName("AuthSecurityEventService 테스트")
class AuthSecurityEventServiceTest {
    @Test
    fun `보존 기간을 지난 보안 이벤트를 batch size 안에서 삭제한다`() {
        val now = Instant.parse("2026-05-21T00:00:00Z")
        val store = RecordingAuthSecurityEventStore()
        val expired = authSecurityEventAt(now.minus(31, ChronoUnit.DAYS))
        val stillRetained = authSecurityEventAt(now.minus(29, ChronoUnit.DAYS))
        val olderExpired = authSecurityEventAt(now.minus(40, ChronoUnit.DAYS))
        store.events += listOf(expired, stillRetained, olderExpired)
        val service =
            AuthSecurityEventService(
                authSecurityEventStore = store,
                retentionDays = 30,
            )

        val purgedCount = service.purgeExpired(batchSize = 1, now = now)

        assertThat(purgedCount).isEqualTo(1)
        assertThat(store.events).containsExactly(expired, stillRetained)
        assertThat(store.deletedEvents).containsExactly(olderExpired)
    }

    private class RecordingAuthSecurityEventStore : AuthSecurityEventStore {
        val events = mutableListOf<AuthSecurityEvent>()
        val deletedEvents = mutableListOf<AuthSecurityEvent>()

        override fun save(event: AuthSecurityEvent) {
            events += event
        }

        override fun findRecent(limit: Int): List<AuthSecurityEvent> =
            events
                .sortedWith(compareByDescending<AuthSecurityEvent> { it.createdAt }.thenByDescending { it.id })
                .take(limit)

        override fun findExpired(
            cutoff: Instant,
            limit: Int,
        ): List<AuthSecurityEvent> =
            events
                .filter { it.createdAt.isBefore(cutoff) }
                .sortedWith(compareBy<AuthSecurityEvent> { it.createdAt }.thenBy { it.id })
                .take(limit)

        override fun deleteAll(events: List<AuthSecurityEvent>) {
            deletedEvents += events
            this.events.removeAll(events.toSet())
        }
    }

    private fun authSecurityEventAt(createdAt: Instant): AuthSecurityEvent =
        AuthSecurityEvent(
            eventType = AuthSecurityEventType.LOGIN_POLICY_APPLIED,
            memberId = 54L,
            loginIdentifier = "admin@example.com",
            rememberLoginEnabled = true,
            ipSecurityEnabled = false,
            clientIpFingerprint = null,
            requestPath = "/member/api/v1/auth/login",
            reason = null,
        ).apply {
            this.createdAt = createdAt
            this.modifiedAt = createdAt
        }
}
