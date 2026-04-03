package com.back.boundedContexts.member.subContexts.session.application.service

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

    private class RecordingMemberSessionStorePort : MemberSessionStorePort {
        var touchCallCount: Int = 0
        var lastTouchedSessionId: Long? = null

        override fun save(memberSession: MemberSession): MemberSession = error("not used")

        override fun findBySessionKey(sessionKey: String): MemberSession? = error("not used")

        override fun findBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSession? = error("not used")

        override fun findByMemberIdAndSessionKeyAndRevokedAtIsNull(
            memberId: Long,
            sessionKey: String,
        ): MemberSession? = error("not used")

        override fun findActiveSnapshotBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSessionAuthSnapshot? = error("not used")

        override fun findActiveSnapshotByMemberIdAndSessionKeyAndRevokedAtIsNull(
            memberId: Long,
            sessionKey: String,
        ): MemberSessionAuthSnapshot? = error("not used")

        override fun touchAuthenticatedIfDue(
            sessionId: Long,
            threshold: Instant,
            now: Instant,
        ): Boolean {
            touchCallCount += 1
            lastTouchedSessionId = sessionId
            return false
        }
    }
}
