package com.back.boundedContexts.member.subContexts.session.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.member.subContexts.session.application.port.output.MemberSessionStorePort
import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot
import org.springframework.beans.factory.annotation.Value
import org.springframework.cache.CacheManager
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

/**
 * 로그인 세션 생성/조회/폐기를 담당하는 서비스입니다.
 */
@Service
class MemberSessionService(
    private val memberSessionStorePort: MemberSessionStorePort,
    private val cacheManager: CacheManager,
    @param:Value("\${custom.auth.session.touchMinIntervalSeconds:60}")
    private val touchMinIntervalSeconds: Long,
) : MemberSessionUseCase {
    @Transactional
    override fun createSession(
        member: Member,
        rememberLoginEnabled: Boolean,
        ipSecurityEnabled: Boolean,
        ipSecurityFingerprint: String?,
        createdIp: String?,
        userAgent: String?,
    ): MemberSession {
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
        session.touchAuthenticated()
        return memberSessionStorePort.save(session)
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
        val threshold = now.minusSeconds(touchMinIntervalSeconds.coerceAtLeast(0))
        val updated = memberSessionStorePort.touchAuthenticatedIfDue(snapshot.id, threshold, now)
        if (updated) {
            evictActiveSnapshot(snapshot.memberId, snapshot.sessionKey)
        }
    }

    @Transactional
    override fun revokeSession(sessionKey: String) {
        if (sessionKey.isBlank()) return
        val session = memberSessionStorePort.findBySessionKeyAndRevokedAtIsNull(sessionKey) ?: return
        session.revoke()
        evictActiveSnapshot(session.member.id, sessionKey)
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
}
