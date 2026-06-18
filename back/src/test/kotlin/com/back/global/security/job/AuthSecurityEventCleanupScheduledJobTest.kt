package com.back.global.security.job

import com.back.global.security.application.AuthSecurityEventService
import com.back.global.security.application.port.output.AuthSecurityEventStore
import com.back.global.security.model.AuthSecurityEvent
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.time.Instant

@DisplayName("AuthSecurityEventCleanupScheduledJob 테스트")
class AuthSecurityEventCleanupScheduledJobTest {
    @Test
    @DisplayName("cleanup은 만료된 보안 이벤트를 정리한다")
    fun cleanupPurgesExpiredSecurityEvents() {
        // given
        val store = RecordingAuthSecurityEventStore()
        store.deletedCounts += 1
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

        // when
        job.cleanup()

        // then
        assertThat(store.deleteExpiredBeforeCalls).hasSize(1)
    }

    @Test
    @DisplayName("cleanup은 한 번의 스케줄에서 최대 batch 수만큼 반복 정리한다")
    fun cleanupRepeatsUntilMaxBatchCount() {
        // given
        val store = RecordingAuthSecurityEventStore()
        store.deletedCounts += listOf(1, 1, 1)
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

        // when
        job.cleanup()

        // then
        assertThat(store.deleteExpiredBeforeCalls).hasSize(2)
    }

    private class RecordingAuthSecurityEventStore : AuthSecurityEventStore {
        val deletedCounts = ArrayDeque<Int>()
        val deleteExpiredBeforeCalls = mutableListOf<DeleteExpiredBeforeCall>()

        override fun save(event: AuthSecurityEvent) {
        }

        override fun findRecent(limit: Int): List<AuthSecurityEvent> = emptyList()

        override fun deleteExpiredBefore(
            cutoff: Instant,
            limit: Int,
        ): Int {
            deleteExpiredBeforeCalls += DeleteExpiredBeforeCall(cutoff, limit)
            return deletedCounts.removeFirstOrNull() ?: 0
        }
    }

    private data class DeleteExpiredBeforeCall(
        val cutoff: Instant,
        val limit: Int,
    )
}
