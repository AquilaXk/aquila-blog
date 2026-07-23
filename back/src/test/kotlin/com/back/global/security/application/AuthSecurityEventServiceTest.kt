package com.back.global.security.application

import com.back.boundedContexts.member.domain.shared.Member
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
    @DisplayName("성공 로그인 보안 이벤트는 이메일 원문 대신 memberId만 저장한다")
    fun recordLoginPolicyAppliedDropsRawEmail() {
        // given
        val store = RecordingAuthSecurityEventStore()
        val service = AuthSecurityEventService(authSecurityEventStore = store)
        val member =
            Member(
                id = 7L,
                username = "user",
                password = null,
                nickname = "사용자",
                email = "canary-login@example.com",
            )

        // when
        service.recordLoginPolicyApplied(
            member = member,
            loginIdentifier = "canary-login@example.com",
            requestPath = "/member/api/v1/auth/login",
        )

        // then
        assertThat(store.saved.single().eventType).isEqualTo(AuthSecurityEventType.LOGIN_POLICY_APPLIED)
        assertThat(store.saved.single().memberId).isEqualTo(7L)
        assertThat(store.saved.single().loginIdentifier).isNull()
    }

    @Test
    @DisplayName("회원 식별자가 없는 보안 차단 이벤트는 로그인 식별자를 해시로 저장한다")
    fun recordIpSecurityMismatchBlockedHashesAnonymousIdentifier() {
        // given
        val store = RecordingAuthSecurityEventStore()
        val service = AuthSecurityEventService(authSecurityEventStore = store)

        // when
        service.recordIpSecurityMismatchBlocked(
            memberId = null,
            loginIdentifier = "CANARY-LOGIN@example.com",
            rememberLoginEnabled = true,
            ipSecurityEnabled = true,
            expectedIpFingerprint = "fingerprint",
            requestPath = "/member/api/v1/auth/me",
            reason = "ip_mismatch",
        )

        // then
        val saved = store.saved.single()
        assertThat(saved.loginIdentifier).startsWith("sha256:")
        assertThat(saved.loginIdentifier).doesNotContain("CANARY-LOGIN@example.com")
        assertThat(saved.loginIdentifier).doesNotContain("canary-login@example.com")
    }

    @Test
    @DisplayName("최근 보안 이벤트 조회는 IP fingerprint를 마스킹한다")
    fun getRecentMasksClientIpFingerprint() {
        // given
        val store = RecordingAuthSecurityEventStore()
        store.recent += securityEvent(id = 1L, fingerprint = null)
        store.recent += securityEvent(id = 2L, fingerprint = "short-fp")
        store.recent += securityEvent(id = 3L, fingerprint = "12345678901234567890")
        val service = AuthSecurityEventService(authSecurityEventStore = store)

        // when
        val recent = service.getRecent(30)

        // then
        assertThat(recent.map { it.clientIpFingerprint }).containsExactly(
            null,
            "short-fp",
            "123456789012...7890",
        )
    }

    @Test
    @DisplayName("회원 식별자가 없는 빈 로그인 식별자는 저장하지 않는다")
    fun recordIpSecurityMismatchBlockedDropsBlankAnonymousIdentifier() {
        // given
        val store = RecordingAuthSecurityEventStore()
        val service = AuthSecurityEventService(authSecurityEventStore = store)

        // when
        service.recordIpSecurityMismatchBlocked(
            memberId = null,
            loginIdentifier = " ",
            rememberLoginEnabled = true,
            ipSecurityEnabled = true,
            expectedIpFingerprint = "fingerprint",
            requestPath = "/member/api/v1/auth/me",
            reason = "ip_mismatch",
        )

        // then
        assertThat(store.saved.single().loginIdentifier).isNull()
    }

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
        val saved = mutableListOf<AuthSecurityEvent>()
        val recent = mutableListOf<AuthSecurityEvent>()
        val deleteExpiredBeforeCalls = mutableListOf<DeleteExpiredBeforeCall>()

        override fun save(event: AuthSecurityEvent) {
            saved += event
        }

        override fun findRecent(limit: Int): List<AuthSecurityEvent> = recent.take(limit)

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

    private fun securityEvent(
        id: Long,
        fingerprint: String?,
    ): AuthSecurityEvent =
        AuthSecurityEvent(
            id = id,
            eventType = AuthSecurityEventType.IP_SECURITY_MISMATCH_BLOCKED,
            memberId = id,
            loginIdentifier = null,
            rememberLoginEnabled = true,
            ipSecurityEnabled = true,
            clientIpFingerprint = fingerprint,
            requestPath = "/member/api/v1/auth/me",
            reason = "ip_mismatch",
        ).apply {
            createdAt = Instant.EPOCH
            modifiedAt = Instant.EPOCH
        }
}
