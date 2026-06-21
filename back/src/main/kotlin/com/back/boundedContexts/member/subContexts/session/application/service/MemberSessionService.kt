package com.back.boundedContexts.member.subContexts.session.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.member.subContexts.session.application.port.output.MemberSessionStorePort
import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionRefreshTokenPolicy
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionWithRefreshToken
import org.springframework.beans.factory.annotation.Value
import org.springframework.cache.CacheManager
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * 로그인 세션 생성/조회/폐기를 담당하는 서비스입니다.
 */
@Service
class MemberSessionService(
    private val memberSessionStorePort: MemberSessionStorePort,
    private val cacheManager: CacheManager,
    @param:Value("\${custom.auth.session.touchMinIntervalSeconds:60}")
    private val touchMinIntervalSeconds: Long,
    @param:Value("\${custom.auth.refreshToken.expirationSeconds:2592000}")
    private val refreshTokenExpirationSeconds: Long = 2_592_000,
    @param:Value("\${custom.auth.session.maxActivePerMember:32}")
    private val maxActivePerMember: Int = 32,
    @param:Value("\${custom.auth.session.revokedRetentionDays:30}")
    private val revokedSessionRetentionDays: Int = 30,
) : MemberSessionUseCase {
    @Transactional
    override fun createSession(
        member: Member,
        rememberLoginEnabled: Boolean,
        ipSecurityEnabled: Boolean,
        ipSecurityFingerprint: String?,
        createdIp: String?,
        userAgent: String?,
    ): MemberSession =
        createSessionWithRefreshToken(
            member = member,
            rememberLoginEnabled = rememberLoginEnabled,
            ipSecurityEnabled = ipSecurityEnabled,
            ipSecurityFingerprint = ipSecurityFingerprint,
            createdIp = createdIp,
            userAgent = userAgent,
        ).session

    @Transactional
    override fun createSessionWithRefreshToken(
        member: Member,
        rememberLoginEnabled: Boolean,
        ipSecurityEnabled: Boolean,
        ipSecurityFingerprint: String?,
        createdIp: String?,
        userAgent: String?,
    ): MemberSessionWithRefreshToken {
        val now = Instant.now()
        val refreshToken = MemberSessionRefreshTokenPolicy.generate()
        val session =
            MemberSession(
                member = member,
                sessionKey = MemberPolicy.genApiKey(),
                rememberLoginEnabled = rememberLoginEnabled,
                ipSecurityEnabled = ipSecurityEnabled,
                ipSecurityFingerprint = if (ipSecurityEnabled) ipSecurityFingerprint else null,
                createdIp = createdIp?.take(120),
                userAgent = userAgent?.take(512),
            )
        session.touchAuthenticated(now)
        session.bindRefreshToken(refreshToken, refreshTokenExpiresAt(now), now)
        val savedSession = memberSessionStorePort.save(session)
        val revokedCount =
            memberSessionStorePort.revokeActiveSessionsBeyondLimit(
                memberId = savedSession.member.id,
                keepLimit = maxActivePerMember.coerceAtLeast(1),
                now = now,
            )
        if (revokedCount > 0) {
            evictAllActiveSnapshots()
        }
        return MemberSessionWithRefreshToken(
            session = savedSession,
            refreshToken = refreshToken,
        )
    }

    @Transactional(readOnly = true)
    override fun findActiveSession(sessionKey: String): MemberSession? {
        if (sessionKey.isBlank()) return null
        return memberSessionStorePort.findBySessionKeyAndRevokedAtIsNull(sessionKey)
    }

    @Transactional(readOnly = true)
    override fun findActiveSession(
        memberId: Long,
        sessionKey: String,
    ): MemberSession? {
        if (sessionKey.isBlank()) return null
        return memberSessionStorePort.findByMemberIdAndSessionKeyAndRevokedAtIsNull(memberId, sessionKey)
    }

    @Cacheable(
        cacheNames = [MemberSessionCacheNames.ACTIVE],
        key = "'session:' + #sessionKey",
        unless = "#result == null",
    )
    @Transactional(readOnly = true)
    override fun findActiveSessionSnapshot(sessionKey: String): MemberSessionAuthSnapshot? {
        if (sessionKey.isBlank()) return null
        return memberSessionStorePort.findActiveSnapshotBySessionKeyAndRevokedAtIsNull(sessionKey)
    }

    @Cacheable(
        cacheNames = [MemberSessionCacheNames.ACTIVE],
        key = "'member:' + #memberId + ':session:' + #sessionKey",
        unless = "#result == null",
    )
    @Transactional(readOnly = true)
    override fun findActiveSessionSnapshot(
        memberId: Long,
        sessionKey: String,
    ): MemberSessionAuthSnapshot? {
        if (sessionKey.isBlank()) return null
        return memberSessionStorePort.findActiveSnapshotByMemberIdAndSessionKeyAndRevokedAtIsNull(memberId, sessionKey)
    }

    @Transactional
    override fun touchAuthenticated(memberSession: MemberSession) {
        memberSession.touchAuthenticatedIfDue(touchMinIntervalSeconds)
    }

    @Transactional
    override fun touchAuthenticated(snapshot: MemberSessionAuthSnapshot) {
        val now = Instant.now()
        if (!isTouchDue(snapshot.lastAuthenticatedAt, now)) return
        val threshold = now.minusSeconds(touchMinIntervalSeconds.coerceAtLeast(0))
        val updated = memberSessionStorePort.touchAuthenticatedIfDue(snapshot.id, threshold, now)
        if (updated) {
            evictActiveSnapshot(snapshot.memberId, snapshot.sessionKey)
        }
    }

    @Transactional
    override fun rotateRefreshToken(
        sessionKey: String,
        refreshToken: String,
    ): MemberSessionWithRefreshToken? {
        if (sessionKey.isBlank() || refreshToken.isBlank()) return null
        val session = memberSessionStorePort.findWithMemberBySessionKeyAndRevokedAtIsNull(sessionKey) ?: return null
        val now = Instant.now()

        if (!session.matchesRefreshToken(refreshToken, now)) {
            if (session.isRefreshTokenExpired(now)) {
                session.revoke(now)
            } else {
                session.markRefreshTokenReused(now)
            }
            evictActiveSnapshot(session.member.id, session.sessionKey)
            return null
        }

        val nextRefreshToken = MemberSessionRefreshTokenPolicy.generate()
        session.bindRefreshToken(nextRefreshToken, refreshTokenExpiresAt(now), now)
        session.touchAuthenticated(now)
        evictActiveSnapshot(session.member.id, session.sessionKey)
        return MemberSessionWithRefreshToken(session = session, refreshToken = nextRefreshToken)
    }

    @Transactional
    override fun revokeSession(sessionKey: String) {
        if (sessionKey.isBlank()) return
        val session = memberSessionStorePort.findBySessionKeyAndRevokedAtIsNull(sessionKey) ?: return
        session.revoke()
        evictActiveSnapshot(session.member.id, sessionKey)
    }

    @Transactional
    override fun revokeAllActiveSessionsForMember(memberId: Long): Int {
        val revokedCount = memberSessionStorePort.revokeAllActiveSessionsForMember(memberId, Instant.now())
        if (revokedCount > 0) {
            evictAllActiveSnapshots()
        }
        return revokedCount
    }

    @Transactional
    fun purgeExpiredRevokedSessions(
        batchSize: Int,
        now: Instant = Instant.now(),
    ): Int {
        val cutoff = now.minus(revokedSessionRetentionDays.coerceAtLeast(1).toLong(), ChronoUnit.DAYS)
        return memberSessionStorePort.deleteRevokedBefore(cutoff, batchSize.coerceIn(1, 1_000))
    }

    private fun evictActiveSnapshot(
        memberId: Long,
        sessionKey: String,
    ) {
        cacheManager.getCache(MemberSessionCacheNames.ACTIVE)?.let { cache ->
            cache.evict("session:$sessionKey")
            cache.evict("member:$memberId:session:$sessionKey")
        }
    }

    private fun evictAllActiveSnapshots() {
        cacheManager.getCache(MemberSessionCacheNames.ACTIVE)?.clear()
    }

    private fun isTouchDue(
        lastAuthenticatedAt: Instant?,
        now: Instant,
    ): Boolean {
        if (touchMinIntervalSeconds <= 0) return true
        return lastAuthenticatedAt == null || !now.isBefore(lastAuthenticatedAt.plusSeconds(touchMinIntervalSeconds))
    }

    private fun refreshTokenExpiresAt(now: Instant): Instant = now.plusSeconds(refreshTokenExpirationSeconds.coerceAtLeast(1))
}
