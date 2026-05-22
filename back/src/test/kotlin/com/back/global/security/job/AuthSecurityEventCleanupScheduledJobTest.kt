package com.back.global.security.job

import com.back.global.security.application.AuthSecurityEventService
import com.back.global.security.application.port.output.AuthSecurityEventStore
import com.back.global.security.domain.AuthSecurityEventType
import com.back.global.security.model.AuthSecurityEvent
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.temporal.ChronoUnit

@DisplayName("AuthSecurityEventCleanupScheduledJob 테스트")
class AuthSecurityEventCleanupScheduledJobTest {
    @Test
    fun `cleanup은 만료된 보안 이벤트를 정리한다`() {
        val store = RecordingAuthSecurityEventStore()
        val expiredEvent = authSecurityEventAt(Instant.now().minus(31, ChronoUnit.DAYS))
        store.events += expiredEvent
        val service =
            AuthSecurityEventService(
                authSecurityEventStore = store,
                retentionDays = 30,
            )
        val job =
            AuthSecurityEventCleanupScheduledJob(
                authSecurityEventService = service,
                batchSize = 10,
                maxBatches = 1,
            )

        job.cleanup()

        assertThat(store.events).isEmpty()
        assertThat(store.deletedEvents).containsExactly(expiredEvent)
    }

    @Test
    fun `cleanup은 한 번의 스케줄에서 최대 batch 수만큼 반복 정리한다`() {
        val now = Instant.now()
        val store = RecordingAuthSecurityEventStore()
        val first = authSecurityEventAt(now.minus(40, ChronoUnit.DAYS))
        val second = authSecurityEventAt(now.minus(39, ChronoUnit.DAYS))
        val third = authSecurityEventAt(now.minus(38, ChronoUnit.DAYS))
        store.events += listOf(first, second, third)
        val service =
            AuthSecurityEventService(
                authSecurityEventStore = store,
                retentionDays = 30,
            )
        val job =
            AuthSecurityEventCleanupScheduledJob(
                authSecurityEventService = service,
                batchSize = 1,
                maxBatches = 2,
            )

        job.cleanup()

        assertThat(store.deletedEvents).containsExactly(first, second)
        assertThat(store.events).containsExactly(third)
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
