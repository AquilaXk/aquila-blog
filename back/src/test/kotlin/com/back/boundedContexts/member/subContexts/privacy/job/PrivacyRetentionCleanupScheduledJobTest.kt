package com.back.boundedContexts.member.subContexts.privacy.job

import com.back.boundedContexts.member.subContexts.memberActionLog.application.port.output.MemberActionLogRepositoryPort
import com.back.boundedContexts.member.subContexts.memberActionLog.domain.MemberActionLog
import com.back.boundedContexts.member.subContexts.notification.adapter.persistence.MemberNotificationRepository
import com.back.boundedContexts.member.subContexts.notification.application.port.output.MemberNotificationRepositoryPort
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberPrivacyRequestRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequest
import com.back.boundedContexts.member.subContexts.signupVerification.application.port.output.MemberSignupVerificationRepositoryPort
import com.back.boundedContexts.member.subContexts.signupVerification.domain.MemberSignupVerification
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

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
    fun `notification retention delete query는 scheduled job에서 단독 실행되도록 transactional 이다`() {
        val method =
            MemberNotificationRepository::class.java.getMethod(
                "deleteCreatedBefore",
                Instant::class.java,
                Int::class.javaPrimitiveType,
            )

        assertThat(method.isAnnotationPresent(Transactional::class.java)).isTrue()
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

        override fun save(memberSignupVerification: MemberSignupVerification): MemberSignupVerification = memberSignupVerification

        override fun findByEmailVerificationTokenHash(emailVerificationTokenHash: String): MemberSignupVerification? = null

        override fun findBySignupSessionTokenHash(signupSessionTokenHash: String): MemberSignupVerification? = null

        override fun findTopByEmail(email: String): MemberSignupVerification? = null

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

    private class RecordingNotificationRepository(
        vararg counts: Int,
    ) : MemberNotificationRepositoryPort {
        private val counts = ArrayDeque(counts.toList())
        val calls = mutableListOf<DeleteCall>()

        override fun save(notification: MemberNotification): MemberNotification = notification

        override fun findLatestByReceiverId(receiverId: Long): List<MemberNotification> = emptyList()

        override fun findByReceiverIdAndIdGreaterThan(
            receiverId: Long,
            lastNotificationId: Long,
            limit: Int,
        ): List<MemberNotification> = emptyList()

        override fun countUnreadByReceiverId(receiverId: Long): Long = 0

        override fun existsByEventUid(eventUid: UUID): Boolean = false

        override fun markAllRead(
            receiverId: Long,
            readAt: Instant,
        ): Int = 0

        override fun markRead(
            id: Long,
            receiverId: Long,
            readAt: Instant,
        ): Int = 0

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
