package com.back.boundedContexts.member.subContexts.privacy.job

import com.back.boundedContexts.member.subContexts.memberActionLog.application.port.output.MemberActionLogRepositoryPort
import com.back.boundedContexts.member.subContexts.memberActionLog.domain.MemberActionLog
import com.back.global.jpa.domain.BaseTime
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Instant

class PrivacyRetentionCleanupScheduledJobTest {
    @Test
    fun `cleanup은 configured cutoff와 batch limit으로 관리자 action log를 정리한다`() {
        val now = Instant.parse("2026-06-23T00:00:00Z")
        val actionLog = RecordingActionLogRepository(1)
        val registry = SimpleMeterRegistry()
        val job =
            PrivacyRetentionCleanupScheduledJob(
                memberActionLogRepository = actionLog,
                meterRegistry = registry,
                memberActionLogDays = 90,
                batchSize = 25,
                maxBatches = 1,
            )

        job.cleanup(now)

        assertThat(actionLog.calls).containsExactly(DeleteCall(now.minusSeconds(90 * DAY), 25))
        assertThat(registry.counter("privacy.retention.cleanup.deleted", "target", "member_action_log").count()).isEqualTo(1.0)
    }

    @Test
    fun `cleanup은 대상별로 0건 또는 maxBatches 도달 시 멈춰 재실행 안전하다`() {
        val now = Instant.parse("2026-06-23T00:00:00Z")
        val actionLog = RecordingActionLogRepository(2, 2, 2)
        val job =
            PrivacyRetentionCleanupScheduledJob(
                memberActionLogRepository = actionLog,
                meterRegistry = SimpleMeterRegistry(),
                memberActionLogDays = 90,
                batchSize = 2,
                maxBatches = 2,
            )

        job.cleanup(now)

        assertThat(actionLog.calls).hasSize(2)
    }

    @Test
    fun `cleanup은 target 실패를 metric으로 기록하고 개인정보 없이 로그 경로로 넘긴다`() {
        val registry = SimpleMeterRegistry()
        val job =
            PrivacyRetentionCleanupScheduledJob(
                memberActionLogRepository = FailingActionLogRepository(),
                meterRegistry = registry,
                memberActionLogDays = 90,
                batchSize = 25,
                maxBatches = 1,
            )

        job.cleanup(Instant.parse("2026-06-23T00:00:00Z"))

        assertThat(registry.counter("privacy.retention.cleanup.failed", "target", "member_action_log").count()).isEqualTo(1.0)
    }

    @Test
    fun `action log retention은 created_at purge를 위해 timestamp base model을 사용한다`() {
        assertThat(BaseTime::class.java.isAssignableFrom(MemberActionLog::class.java)).isTrue()
    }

    private data class DeleteCall(
        val cutoff: Instant,
        val limit: Int,
    )

    private class RecordingActionLogRepository(
        vararg counts: Int,
    ) : MemberActionLogRepositoryPort {
        private val counts = ArrayDeque(counts.toList())
        val calls = mutableListOf<DeleteCall>()

        override fun save(memberActionLog: MemberActionLog): MemberActionLog = memberActionLog

        override fun deleteCreatedBefore(
            cutoff: Instant,
            limit: Int,
        ): Int = record(calls, counts, cutoff, limit)
    }

    private class FailingActionLogRepository : MemberActionLogRepositoryPort {
        override fun save(memberActionLog: MemberActionLog): MemberActionLog = memberActionLog

        override fun deleteCreatedBefore(
            cutoff: Instant,
            limit: Int,
        ): Int = throw IllegalStateException("synthetic cleanup failure")
    }

    companion object {
        private const val DAY = 24 * 60 * 60L

        private fun record(
            calls: MutableList<DeleteCall>,
            counts: ArrayDeque<Int>,
            cutoff: Instant,
            limit: Int,
        ): Int {
            calls += DeleteCall(cutoff, limit)
            return counts.removeFirstOrNull() ?: 0
        }
    }
}
