package com.back.boundedContexts.member.subContexts.privacy.job

import com.back.boundedContexts.member.subContexts.memberActionLog.application.port.output.MemberActionLogRepositoryPort
import com.back.boundedContexts.member.subContexts.memberActionLog.domain.MemberActionLog
import com.back.boundedContexts.member.subContexts.notification.adapter.persistence.MemberNotificationRepository
import com.back.boundedContexts.member.subContexts.notification.application.port.output.MemberNotificationRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberPrivacyRequestRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequest
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestType
import com.back.boundedContexts.member.subContexts.signupVerification.application.port.output.MemberSignupVerificationRepositoryPort
import com.back.global.jpa.domain.BaseTime
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.Optional

class PrivacyRetentionCleanupScheduledJobTest {
    @Test
    fun `cleanup은 configured cutoff와 batch limit으로 각 privacy retention target을 정리한다`() {
        val now = Instant.parse("2026-06-23T00:00:00Z")
        val signup = RecordingSignupVerificationRepository(1)
        val actionLog = RecordingActionLogRepository(1)
        val notification = RecordingNotificationRepository(1)
        val privacyRequest = RecordingPrivacyRequestRepository(1)
        val registry = SimpleMeterRegistry()
        val job =
            PrivacyRetentionCleanupScheduledJob(
                signupVerificationRepository = signup,
                memberActionLogRepository = actionLog,
                memberNotificationRepository = notification,
                memberPrivacyRequestRepository = privacyRequest,
                meterRegistry = registry,
                signupVerificationDays = 7,
                memberActionLogDays = 90,
                notificationDays = 60,
                privacyRequestDays = 30,
                batchSize = 25,
                maxBatches = 1,
            )

        job.cleanup(now)

        assertThat(signup.calls).containsExactly(DeleteCall(now.minusSeconds(7 * DAY), 25))
        assertThat(actionLog.calls).containsExactly(DeleteCall(now.minusSeconds(90 * DAY), 25))
        assertThat(notification.calls).containsExactly(DeleteCall(now.minusSeconds(60 * DAY), 25))
        assertThat(privacyRequest.calls).containsExactly(DeleteCall(now.minusSeconds(30 * DAY), 25))
        assertThat(registry.counter("privacy.retention.cleanup.deleted", "target", "signup_verification").count()).isEqualTo(1.0)
    }

    @Test
    fun `cleanup은 대상별로 0건 또는 maxBatches 도달 시 멈춰 재실행 안전하다`() {
        val now = Instant.parse("2026-06-23T00:00:00Z")
        val signup = RecordingSignupVerificationRepository(2, 2, 2)
        val empty = RecordingActionLogRepository(0)
        val job =
            PrivacyRetentionCleanupScheduledJob(
                signupVerificationRepository = signup,
                memberActionLogRepository = empty,
                memberNotificationRepository = RecordingNotificationRepository(0),
                memberPrivacyRequestRepository = RecordingPrivacyRequestRepository(0),
                meterRegistry = SimpleMeterRegistry(),
                signupVerificationDays = 7,
                memberActionLogDays = 90,
                notificationDays = 60,
                privacyRequestDays = 30,
                batchSize = 2,
                maxBatches = 2,
            )

        job.cleanup(now)

        assertThat(signup.calls).hasSize(2)
        assertThat(empty.calls).hasSize(1)
    }

    @Test
    fun `cleanup은 target 실패를 metric으로 기록하고 개인정보 없이 로그 경로로 넘긴다`() {
        val registry = SimpleMeterRegistry()
        val job =
            PrivacyRetentionCleanupScheduledJob(
                signupVerificationRepository = RecordingSignupVerificationRepository(0),
                memberActionLogRepository = FailingActionLogRepository(),
                memberNotificationRepository = RecordingNotificationRepository(0),
                memberPrivacyRequestRepository = RecordingPrivacyRequestRepository(0),
                meterRegistry = registry,
                signupVerificationDays = 7,
                memberActionLogDays = 90,
                notificationDays = 60,
                privacyRequestDays = 30,
                batchSize = 25,
                maxBatches = 1,
            )

        job.cleanup(Instant.parse("2026-06-23T00:00:00Z"))

        assertThat(registry.counter("privacy.retention.cleanup.failed", "target", "member_action_log").count()).isEqualTo(1.0)
    }

    @Test
    fun `notification retention delete query는 scheduled job에서 단독 실행되도록 transactional 이다`() {
        val method =
            MemberNotificationRepository::class.java.getMethod(
                "deleteCreatedBefore",
                Instant::class.java,
                Int::class.javaPrimitiveType,
            )

        assertThat(method.isAnnotationPresent(Transactional::class.java)).isTrue()
    }

    @Test
    fun `action log retention은 created_at purge를 위해 timestamp base model을 사용한다`() {
        assertThat(BaseTime::class.java.isAssignableFrom(MemberActionLog::class.java)).isTrue()
    }

    private data class DeleteCall(
        val cutoff: Instant,
        val limit: Int,
    )

    private class RecordingSignupVerificationRepository(
        vararg counts: Int,
    ) : MemberSignupVerificationRepositoryPort {
        private val counts = ArrayDeque(counts.toList())
        val calls = mutableListOf<DeleteCall>()

        override fun deleteRetainedBefore(
            cutoff: Instant,
            limit: Int,
        ): Int = record(calls, counts, cutoff, limit)
    }

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

    private class RecordingNotificationRepository(
        vararg counts: Int,
    ) : MemberNotificationRepositoryPort {
        private val counts = ArrayDeque(counts.toList())
        val calls = mutableListOf<DeleteCall>()

        override fun deleteCreatedBefore(
            cutoff: Instant,
            limit: Int,
        ): Int = record(calls, counts, cutoff, limit)
    }

    private class RecordingPrivacyRequestRepository(
        vararg counts: Int,
    ) : MemberPrivacyRequestRepositoryPort {
        private val counts = ArrayDeque(counts.toList())
        val calls = mutableListOf<DeleteCall>()

        override fun save(memberPrivacyRequest: MemberPrivacyRequest): MemberPrivacyRequest = memberPrivacyRequest

        override fun findByIdAndMemberId(
            id: Long,
            memberId: Long,
        ): MemberPrivacyRequest? = null

        override fun findByIdForUpdate(id: Long): Optional<MemberPrivacyRequest> =
            throw UnsupportedOperationException("not used by privacy retention cleanup tests")

        override fun findById(id: Long): Optional<MemberPrivacyRequest> =
            throw UnsupportedOperationException("not used by privacy retention cleanup tests")

        override fun findAllByOrderByRequestedAtDescIdDesc(): List<MemberPrivacyRequest> =
            throw UnsupportedOperationException("not used by privacy retention cleanup tests")

        override fun existsByMemberIdAndTypeAndStatusIn(
            memberId: Long,
            type: MemberPrivacyRequestType,
            statuses: Collection<MemberPrivacyRequestStatus>,
        ): Boolean = throw UnsupportedOperationException("not used by privacy retention cleanup tests")

        override fun deleteClosedBefore(
            cutoff: Instant,
            limit: Int,
        ): Int = record(calls, counts, cutoff, limit)
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
