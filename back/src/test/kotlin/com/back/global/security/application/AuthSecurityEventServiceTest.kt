package com.back.global.security.application

import com.back.global.security.application.port.output.AuthSecurityEventStore
import com.back.global.security.model.AuthSecurityEvent
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.temporal.ChronoUnit

@DisplayName("AuthSecurityEventService 테스트")
class AuthSecurityEventServiceTest {
    @Test
    @DisplayName("보존 기간을 지난 보안 이벤트를 DB batch delete로 삭제한다")
    fun purgeExpiredSecurityEventsWithBatchLimit() {
        // given
        val now = Instant.parse("2026-05-21T00:00:00Z")
        val store = RecordingAuthSecurityEventStore()
        store.nextDeletedCount = 1000
        val service =
            AuthSecurityEventService(
                authSecurityEventStore = store,
                retentionDays = 30,
            )

        // when
        val purgedCount = service.purgeExpired(batchSize = 5_000, now = now)

        // then
        assertThat(purgedCount).isEqualTo(1000)
        assertThat(store.deleteExpiredBeforeCalls).containsExactly(
            DeleteExpiredBeforeCall(
                cutoff = now.minus(30, ChronoUnit.DAYS),
                limit = 1_000,
            ),
        )
    }

    private class RecordingAuthSecurityEventStore : AuthSecurityEventStore {
        var nextDeletedCount = 0
        val deleteExpiredBeforeCalls = mutableListOf<DeleteExpiredBeforeCall>()

        override fun save(event: AuthSecurityEvent) {
        }

        override fun findRecent(limit: Int): List<AuthSecurityEvent> = emptyList()

        override fun deleteExpiredBefore(
            cutoff: Instant,
            limit: Int,
        ): Int {
            deleteExpiredBeforeCalls += DeleteExpiredBeforeCall(cutoff, limit)
            return nextDeletedCount
        }
    }

    private data class DeleteExpiredBeforeCall(
        val cutoff: Instant,
        val limit: Int,
    )
}
