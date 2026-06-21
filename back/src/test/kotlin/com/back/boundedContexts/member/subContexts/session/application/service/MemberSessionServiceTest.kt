package com.back.boundedContexts.member.subContexts.session.application.service

import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.boundedContexts.member.model.shared.Member
import com.back.boundedContexts.member.subContexts.session.application.port.output.MemberSessionStorePort
import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.cache.concurrent.ConcurrentMapCacheManager
import java.time.Instant

@DisplayName("MemberSessionService 테스트")
class MemberSessionServiceTest {
    @Test
    fun `세션 생성 시 refreshToken 원문은 한 번만 반환하고 저장소에는 hash 와 만료시각만 저장한다`() {
        val store = RecordingMemberSessionStorePort()
        val service =
            MemberSessionService(
                memberSessionStorePort = store,
                cacheManager = ConcurrentMapCacheManager(),
                touchMinIntervalSeconds = 60,
                refreshTokenExpirationSeconds = 3600,
            )
        val member = Member(54L, "refresh-create-user", null, "리프레시생성", "refresh-create@example.com", MemberPolicy.genApiKey())

        val created =
            service.createSessionWithRefreshToken(
                member = member,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                createdIp = "203.0.113.20",
                userAgent = "test-agent",
            )

        assertThat(created.refreshToken).isNotBlank()
        assertThat(created.session.refreshTokenHash).isNotBlank()
        assertThat(created.session.refreshTokenHash).isNotEqualTo(created.refreshToken)
        assertThat(created.session.refreshTokenExpiresAt).isAfter(Instant.now())
        assertThat(store.findBySessionKey(created.session.sessionKey)).isSameAs(created.session)
    }

    @Test
    fun `refreshToken 회전 후 이전 토큰을 다시 쓰면 세션을 폐기한다`() {
        val store = RecordingMemberSessionStorePort()
        val service =
            MemberSessionService(
                memberSessionStorePort = store,
                cacheManager = ConcurrentMapCacheManager(),
                touchMinIntervalSeconds = 60,
                refreshTokenExpirationSeconds = 3600,
            )
        val member = Member(55L, "refresh-reuse-user", null, "리프레시재사용", "refresh-reuse@example.com", MemberPolicy.genApiKey())
        val created =
            service.createSessionWithRefreshToken(
                member = member,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                createdIp = "203.0.113.21",
                userAgent = "test-agent",
            )
        val originalHash = created.session.refreshTokenHash

        val rotated = service.rotateRefreshToken(created.session.sessionKey, created.refreshToken)

        assertThat(rotated).isNotNull
        assertThat(rotated!!.refreshToken).isNotBlank()
        assertThat(rotated.refreshToken).isNotEqualTo(created.refreshToken)
        assertThat(rotated.session.refreshTokenHash).isNotEqualTo(originalHash)
        assertThat(rotated.session.matchesRefreshToken(rotated.refreshToken)).isTrue()

        val reused = service.rotateRefreshToken(created.session.sessionKey, created.refreshToken)

        assertThat(reused).isNull()
        assertThat(created.session.refreshTokenReusedAt).isNotNull
        assertThat(created.session.revokedAt).isNotNull
    }

    @Test
    fun `세션 생성 후 계정별 활성 세션 상한을 넘는 이전 세션을 폐기한다`() {
        val store = RecordingMemberSessionStorePort()
        val service =
            MemberSessionService(
                memberSessionStorePort = store,
                cacheManager = ConcurrentMapCacheManager(),
                touchMinIntervalSeconds = 60,
                refreshTokenExpirationSeconds = 3600,
                maxActivePerMember = 2,
            )
        val member = Member(56L, "session-cap-user", null, "세션상한", "session-cap@example.com", MemberPolicy.genApiKey())

        val first =
            service.createSessionWithRefreshToken(
                member = member,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                createdIp = "203.0.113.30",
                userAgent = "test-agent",
            )
        val second =
            service.createSessionWithRefreshToken(
                member = member,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                createdIp = "203.0.113.31",
                userAgent = "test-agent",
            )
        val third =
            service.createSessionWithRefreshToken(
                member = member,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                createdIp = "203.0.113.32",
                userAgent = "test-agent",
            )

        assertThat(first.session.revokedAt).isNotNull
        assertThat(second.session.revokedAt).isNull()
        assertThat(third.session.revokedAt).isNull()
        assertThat(store.activeSessionKeys(member.id)).containsExactly(second.session.sessionKey, third.session.sessionKey)
        assertThat(store.lastRevokedBeyondLimit).isEqualTo(2)
    }

    @Test
    fun `snapshot lastAuthenticatedAt 이 최소 간격 이내면 DB touch update를 생략한다`() {
        val store = RecordingMemberSessionStorePort()
        val service =
            MemberSessionService(
                memberSessionStorePort = store,
                cacheManager = ConcurrentMapCacheManager(),
                touchMinIntervalSeconds = 60,
            )
        val snapshot =
            MemberSessionAuthSnapshot(
                id = 1L,
                memberId = 54L,
                sessionKey = "session-key",
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                lastAuthenticatedAt = Instant.now().minusSeconds(10),
            )

        service.touchAuthenticated(snapshot)

        assertThat(store.touchCallCount).isZero()
    }

    @Test
    fun `snapshot lastAuthenticatedAt 이 최소 간격을 넘기면 DB touch update를 시도한다`() {
        val store = RecordingMemberSessionStorePort()
        val service =
            MemberSessionService(
                memberSessionStorePort = store,
                cacheManager = ConcurrentMapCacheManager(),
                touchMinIntervalSeconds = 60,
            )
        val snapshot =
            MemberSessionAuthSnapshot(
                id = 1L,
                memberId = 54L,
                sessionKey = "session-key",
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                lastAuthenticatedAt = Instant.now().minusSeconds(61),
            )

        service.touchAuthenticated(snapshot)

        assertThat(store.touchCallCount).isEqualTo(1)
        assertThat(store.lastTouchedSessionId).isEqualTo(1L)
    }

    @Test
    fun `revoked session cleanup은 보존 기간을 지난 폐기 세션만 batch size 만큼 삭제한다`() {
        val now = Instant.parse("2026-05-23T00:00:00Z")
        val store = RecordingMemberSessionStorePort()
        val service =
            MemberSessionService(
                memberSessionStorePort = store,
                cacheManager = ConcurrentMapCacheManager(),
                touchMinIntervalSeconds = 60,
                revokedSessionRetentionDays = 30,
            )
        val member = Member(57L, "session-retention-user", null, "세션정리", "session-retention@example.com", MemberPolicy.genApiKey())
        val expiredRevoked = memberSession(member, "expired-revoked").apply { revoke(now.minusSeconds(31 * 24 * 60 * 60)) }
        val retainedRevoked = memberSession(member, "retained-revoked").apply { revoke(now.minusSeconds(29 * 24 * 60 * 60)) }
        val active = memberSession(member, "active-session")
        store.save(expiredRevoked)
        store.save(retainedRevoked)
        store.save(active)

        val purgedCount = service.purgeExpiredRevokedSessions(batchSize = 1, now = now)

        assertThat(purgedCount).isEqualTo(1)
        assertThat(store.findBySessionKey("expired-revoked")).isNull()
        assertThat(store.findBySessionKey("retained-revoked")).isSameAs(retainedRevoked)
        assertThat(store.findBySessionKey("active-session")).isSameAs(active)
    }

    private class RecordingMemberSessionStorePort : MemberSessionStorePort {
        var touchCallCount: Int = 0
        var lastTouchedSessionId: Long? = null
        var lastRevokedBeyondLimit: Int? = null
        private val sessionsByKey = linkedMapOf<String, MemberSession>()

        override fun save(memberSession: MemberSession): MemberSession {
            sessionsByKey[memberSession.sessionKey] = memberSession
            return memberSession
        }

        override fun findBySessionKey(sessionKey: String): MemberSession? = sessionsByKey[sessionKey]

        override fun findBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSession? =
            sessionsByKey[sessionKey]?.takeIf { it.revokedAt == null }

        override fun findWithMemberBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSession? =
            findBySessionKeyAndRevokedAtIsNull(sessionKey)

        override fun findByMemberIdAndSessionKeyAndRevokedAtIsNull(
            memberId: Long,
            sessionKey: String,
        ): MemberSession? =
            sessionsByKey[sessionKey]
                ?.takeIf { it.member.id == memberId && it.revokedAt == null }

        override fun findActiveSnapshotBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSessionAuthSnapshot? =
            findBySessionKeyAndRevokedAtIsNull(sessionKey)?.toSnapshot()

        override fun findActiveSnapshotByMemberIdAndSessionKeyAndRevokedAtIsNull(
            memberId: Long,
            sessionKey: String,
        ): MemberSessionAuthSnapshot? = findByMemberIdAndSessionKeyAndRevokedAtIsNull(memberId, sessionKey)?.toSnapshot()

        override fun touchAuthenticatedIfDue(
            sessionId: Long,
            threshold: Instant,
            now: Instant,
        ): Boolean {
            touchCallCount += 1
            lastTouchedSessionId = sessionId
            return false
        }

        override fun revokeActiveSessionsBeyondLimit(
            memberId: Long,
            keepLimit: Int,
            now: Instant,
        ): Int {
            lastRevokedBeyondLimit = keepLimit
            val activeSessions =
                sessionsByKey.values
                    .filter { it.member.id == memberId && it.revokedAt == null }
            val sessionsToRevoke = activeSessions.dropLast(keepLimit.coerceAtLeast(1))
            sessionsToRevoke.forEach { it.revoke(now) }
            return sessionsToRevoke.size
        }

        override fun revokeAllActiveSessionsForMember(
            memberId: Long,
            now: Instant,
        ): Int {
            val activeSessions =
                sessionsByKey.values
                    .filter { it.member.id == memberId && it.revokedAt == null }
            activeSessions.forEach { it.revoke(now) }
            return activeSessions.size
        }

        override fun deleteRevokedBefore(
            cutoff: Instant,
            limit: Int,
        ): Int {
            val sessionsToDelete =
                sessionsByKey.values
                    .filter { session -> session.revokedAt?.isBefore(cutoff) == true }
                    .sortedWith(compareBy<MemberSession> { it.revokedAt }.thenBy { it.id })
                    .take(limit)
            sessionsToDelete.forEach { sessionsByKey.remove(it.sessionKey) }
            return sessionsToDelete.size
        }

        fun activeSessionKeys(memberId: Long): List<String> =
            sessionsByKey.values
                .filter { it.member.id == memberId && it.revokedAt == null }
                .map { it.sessionKey }

        private fun MemberSession.toSnapshot(): MemberSessionAuthSnapshot =
            MemberSessionAuthSnapshot(
                id = id,
                memberId = member.id,
                sessionKey = sessionKey,
                rememberLoginEnabled = rememberLoginEnabled,
                ipSecurityEnabled = ipSecurityEnabled,
                ipSecurityFingerprint = ipSecurityFingerprint,
                lastAuthenticatedAt = lastAuthenticatedAt,
            )
    }

    private fun memberSession(
        member: Member,
        sessionKey: String,
    ): MemberSession =
        MemberSession(
            member = member,
            sessionKey = sessionKey,
        )
}
