package com.back.boundedContexts.member.subContexts.session.job

import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.boundedContexts.member.model.shared.Member
import com.back.boundedContexts.member.subContexts.session.application.port.output.MemberSessionStorePort
import com.back.boundedContexts.member.subContexts.session.application.service.MemberSessionService
import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.cache.concurrent.ConcurrentMapCacheManager
import java.time.Instant

class MemberSessionCleanupScheduledJobTest {
    @Test
    fun `cleanup은 만료된 revoked session을 정리한다`() {
        val now = Instant.now()
        val store = RecordingMemberSessionStorePort()
        val member = Member(58L, "session-cleanup-user", null, "세션스케줄", "session-cleanup@example.com", MemberPolicy.genApiKey())
        val expired = MemberSession(member = member, sessionKey = "expired").apply { revoke(now.minusSeconds(31 * 24 * 60 * 60)) }
        store.save(expired)
        val service =
            MemberSessionService(
                memberSessionStorePort = store,
                cacheManager = ConcurrentMapCacheManager(),
                touchMinIntervalSeconds = 60,
                revokedSessionRetentionDays = 30,
            )
        val job =
            MemberSessionCleanupScheduledJob(
                memberSessionService = service,
                batchSize = 10,
            )

        job.cleanup(now)

        assertThat(store.findBySessionKey("expired")).isNull()
    }

    @Test
    fun `cleanup은 batchSize만큼 만료 세션이 가득 차 있으면 최대 10회까지 연속 정리한다`() {
        val now = Instant.now()
        val store = RecordingMemberSessionStorePort()
        val member = Member(58L, "session-cleanup-user", null, "세션스케줄", "session-cleanup@example.com", MemberPolicy.genApiKey())
        // 25개 만료 세션 등록 (batchSize 2 -> 10회 루프 시 최대 20개 정리, 5개 잔여)
        for (i in 1..25) {
            val expired = MemberSession(member = member, sessionKey = "expired-$i").apply { revoke(now.minusSeconds(31 * 24 * 60 * 60)) }
            store.save(expired)
        }
        val service =
            MemberSessionService(
                memberSessionStorePort = store,
                cacheManager = ConcurrentMapCacheManager(),
                touchMinIntervalSeconds = 60,
                revokedSessionRetentionDays = 30,
            )
        val job =
            MemberSessionCleanupScheduledJob(
                memberSessionService = service,
                batchSize = 2,
            )

        job.cleanup(now)

        // 10회 * 2개 = 20개 삭제되고 5개 남아야 함
        assertThat(store.countSessions()).isEqualTo(5)
    }

    private class RecordingMemberSessionStorePort : MemberSessionStorePort {
        private val sessionsByKey = linkedMapOf<String, MemberSession>()

        fun countSessions(): Int = sessionsByKey.size

        override fun save(memberSession: MemberSession): MemberSession {
            sessionsByKey[memberSession.sessionKey] = memberSession
            return memberSession
        }

        override fun findActiveMemberForSessionIssue(memberId: Long): Member? =
            sessionsByKey.values.firstOrNull { it.member.id == memberId }?.member

        override fun findBySessionKey(sessionKey: String): MemberSession? = sessionsByKey[sessionKey]

        override fun findBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSession? = null

        override fun findWithMemberBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSession? = null

        override fun findForUpdateWithMemberBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSession? = null

        override fun findByMemberIdAndSessionKeyAndRevokedAtIsNull(
            memberId: Long,
            sessionKey: String,
        ): MemberSession? = null

        override fun findActiveSnapshotBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSessionAuthSnapshot? = null

        override fun findActiveSnapshotByMemberIdAndSessionKeyAndRevokedAtIsNull(
            memberId: Long,
            sessionKey: String,
        ): MemberSessionAuthSnapshot? = null

        override fun touchAuthenticatedIfDue(
            sessionId: Long,
            threshold: Instant,
            now: Instant,
        ): Boolean = false

        override fun revokeActiveSessionsBeyondLimit(
            memberId: Long,
            keepLimit: Int,
            now: Instant,
        ): Int = 0

        override fun revokeAllActiveSessionsForMember(
            memberId: Long,
            now: Instant,
        ): Int = 0

        override fun deleteRevokedBefore(
            cutoff: Instant,
            limit: Int,
        ): Int {
            val sessionsToDelete =
                sessionsByKey.values
                    .filter { session -> session.revokedAt?.isBefore(cutoff) == true }
                    .take(limit)
            sessionsToDelete.forEach { sessionsByKey.remove(it.sessionKey) }
            return sessionsToDelete.size
        }
    }
}
