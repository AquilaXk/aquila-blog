package com.back.boundedContexts.member.subContexts.session.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.member.subContexts.session.application.port.output.MemberSessionStorePort
import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionRefreshTokenPolicy
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionWithRefreshToken
import com.back.global.cache.application.port.output.RedisKeyValuePort
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import io.micrometer.core.instrument.MeterRegistry
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.cache.CacheManager
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.HexFormat
import java.util.concurrent.ConcurrentHashMap

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
    private val meterRegistry: MeterRegistry? = null,
    private val redisKeyValuePort: RedisKeyValuePort? = null,
    @param:Value("\${custom.auth.refreshToken.rotationGraceSeconds:10}")
    private val refreshTokenRotationGraceSeconds: Long = ROTATION_GRACE_WINDOW.seconds,
) : MemberSessionUseCase {
    private val logger = LoggerFactory.getLogger(MemberSessionService::class.java)
    private val rotationGraceWindow: Duration = Duration.ofSeconds(refreshTokenRotationGraceSeconds.coerceAtLeast(0))
    private val inMemoryRotationGraceEntries = ConcurrentHashMap<String, RotationGraceEntry>()

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
        val activeMember =
            memberSessionStorePort.findActiveMemberForSessionIssue(member.id)
                ?: throw AppException(ErrorCode.MEMBER_WITHDRAWN, "탈퇴 처리된 계정은 세션을 생성할 수 없습니다.")
        val refreshToken = MemberSessionRefreshTokenPolicy.generate()
        val session =
            MemberSession(
                member = activeMember,
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
            evictAllActiveSnapshotsNowAndAfterCommit()
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
        val session = memberSessionStorePort.findForUpdateWithMemberBySessionKeyAndRevokedAtIsNull(sessionKey) ?: return null
        val now = Instant.now()

        if (!session.matchesRefreshToken(refreshToken, now)) {
            val graceRotatedToken = resolveGraceRotatedRefreshToken(session, refreshToken, now)
            if (graceRotatedToken != null) {
                session.touchAuthenticated(now)
                evictActiveSnapshot(session.member.id, session.sessionKey)
                return MemberSessionWithRefreshToken(session = session, refreshToken = graceRotatedToken)
            }
            clearRotationGraceEntry(session.sessionKey)
            if (session.isRefreshTokenExpired(now)) {
                session.revoke(now)
            } else {
                session.markRefreshTokenReused(now)
            }
            evictActiveSnapshot(session.member.id, session.sessionKey)
            return null
        }

        val previousRefreshTokenHash = session.refreshTokenHash
        val nextRefreshToken = MemberSessionRefreshTokenPolicy.generate()
        session.bindRefreshToken(nextRefreshToken, refreshTokenExpiresAt(now), now)
        if (!previousRefreshTokenHash.isNullOrBlank() && !rotationGraceWindow.isZero && !rotationGraceWindow.isNegative) {
            recordRotationGraceEntry(
                sessionKey = session.sessionKey,
                previousRefreshToken = refreshToken,
                previousRefreshTokenHash = previousRefreshTokenHash,
                currentRefreshTokenHash = requireNotNull(session.refreshTokenHash),
                rotatedRefreshToken = nextRefreshToken,
                now = now,
            )
        }
        session.touchAuthenticated(now)
        evictActiveSnapshot(session.member.id, session.sessionKey)
        return MemberSessionWithRefreshToken(session = session, refreshToken = nextRefreshToken)
    }

    @Transactional
    override fun revokeSession(sessionKey: String) {
        if (sessionKey.isBlank()) return
        clearRotationGraceEntry(sessionKey)
        val session = memberSessionStorePort.findBySessionKeyAndRevokedAtIsNull(sessionKey) ?: return
        session.revoke()
        evictActiveSnapshot(session.member.id, sessionKey)
    }

    @Transactional
    override fun revokeAllActiveSessionsForMember(memberId: Long): Int {
        val revokedCount = memberSessionStorePort.revokeAllActiveSessionsForMember(memberId, Instant.now())
        if (revokedCount > 0) {
            inMemoryRotationGraceEntries.clear()
            evictAllActiveSnapshotsNowAndAfterCommit()
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

    private fun recordRotationGraceEntry(
        sessionKey: String,
        previousRefreshToken: String,
        previousRefreshTokenHash: String,
        currentRefreshTokenHash: String,
        rotatedRefreshToken: String,
        now: Instant,
    ) {
        val expiresAt = now.plus(rotationGraceWindow)
        if (inMemoryRotationGraceEntries.size >= MAX_IN_MEMORY_GRACE_ENTRIES) {
            inMemoryRotationGraceEntries.entries.removeIf { !now.isBefore(it.value.expiresAt) }
        }
        val entry =
            RotationGraceEntry(
                previousRefreshTokenHash = previousRefreshTokenHash,
                currentRefreshTokenHash = currentRefreshTokenHash,
                maskedRotatedRefreshToken = maskTokenWithSecret(rotatedRefreshToken, previousRefreshToken),
                expiresAt = expiresAt,
            )
        inMemoryRotationGraceEntries[sessionKey] = entry

        val redis = redisKeyValuePort?.takeIf { it.isAvailable() } ?: return
        runCatching {
            redis.set(rotationGraceRedisKey(sessionKey), entry.serialize(), rotationGraceWindow)
        }
    }

    private fun resolveGraceRotatedRefreshToken(
        session: MemberSession,
        presentedRefreshToken: String,
        now: Instant,
    ): String? {
        if (!session.isWithinRotationGraceWindow(rotationGraceWindow, now)) return null
        val activeHash = session.refreshTokenHash ?: return null
        val presentedHash = MemberSessionRefreshTokenPolicy.hash(presentedRefreshToken)

        val entry =
            readRedisRotationGraceEntry(session.sessionKey)
                ?: inMemoryRotationGraceEntries[session.sessionKey]
                ?: return null

        if (!now.isBefore(entry.expiresAt)) {
            clearRotationGraceEntry(session.sessionKey)
            return null
        }
        if (entry.previousRefreshTokenHash != presentedHash || entry.currentRefreshTokenHash != activeHash) {
            return null
        }
        return unmaskTokenWithSecret(entry.maskedRotatedRefreshToken, presentedRefreshToken)
    }

    private fun readRedisRotationGraceEntry(sessionKey: String): RotationGraceEntry? {
        val redis = redisKeyValuePort?.takeIf { it.isAvailable() } ?: return null
        val raw = runCatching { redis.get(rotationGraceRedisKey(sessionKey)) }.getOrNull() ?: return null
        return RotationGraceEntry.deserialize(raw)
    }

    private fun clearRotationGraceEntry(sessionKey: String) {
        inMemoryRotationGraceEntries.remove(sessionKey)
        val redis = redisKeyValuePort?.takeIf { it.isAvailable() } ?: return
        runCatching {
            redis.delete(listOf(rotationGraceRedisKey(sessionKey)))
        }
    }

    private fun rotationGraceRedisKey(sessionKey: String): String = "$ROTATION_GRACE_REDIS_KEY_PREFIX$sessionKey"

    private fun evictActiveSnapshot(
        memberId: Long,
        sessionKey: String,
    ) {
        cacheManager.getCache(MemberSessionCacheNames.ACTIVE)?.let { cache ->
            runCacheWriteSafely("evict") { cache.evict("session:$sessionKey") }
            runCacheWriteSafely("evict") { cache.evict("member:$memberId:session:$sessionKey") }
        }
    }

    private fun evictAllActiveSnapshots() {
        cacheManager.getCache(MemberSessionCacheNames.ACTIVE)?.let { cache ->
            runCacheWriteSafely("clear") { cache.clear() }
        }
    }

    private fun runCacheWriteSafely(
        operation: String,
        write: () -> Unit,
    ) {
        try {
            write()
        } catch (exception: RuntimeException) {
            meterRegistry?.let { registry ->
                val counter =
                    registry.counter(
                        "member.session.cache.write.failure",
                        "cache",
                        MemberSessionCacheNames.ACTIVE,
                        "operation",
                        operation,
                    )
                counter.increment()
            }
            logger.warn("Session cache write failed (cache={}, operation={})", MemberSessionCacheNames.ACTIVE, operation, exception)
        }
    }

    private fun evictAllActiveSnapshotsNowAndAfterCommit() {
        evictAllActiveSnapshots()
        if (!TransactionSynchronizationManager.isSynchronizationActive()) return

        TransactionSynchronizationManager.registerSynchronization(
            object : TransactionSynchronization {
                override fun afterCommit() {
                    evictAllActiveSnapshots()
                }
            },
        )
    }

    private fun isTouchDue(
        lastAuthenticatedAt: Instant?,
        now: Instant,
    ): Boolean {
        if (touchMinIntervalSeconds <= 0) return true
        return lastAuthenticatedAt == null || !now.isBefore(lastAuthenticatedAt.plusSeconds(touchMinIntervalSeconds))
    }

    private fun refreshTokenExpiresAt(now: Instant): Instant = now.plusSeconds(refreshTokenExpirationSeconds.coerceAtLeast(1))

    private data class RotationGraceEntry(
        val previousRefreshTokenHash: String,
        val currentRefreshTokenHash: String,
        val maskedRotatedRefreshToken: String,
        val expiresAt: Instant,
    ) {
        fun serialize(): String =
            "$previousRefreshTokenHash|$currentRefreshTokenHash|$maskedRotatedRefreshToken|${expiresAt.toEpochMilli()}"

        companion object {
            fun deserialize(raw: String): RotationGraceEntry? {
                val parts = raw.split('|')
                if (parts.size != 4) return null
                val expiresAtMillis = parts[3].toLongOrNull() ?: return null
                if (parts[0].isBlank() || parts[1].isBlank() || parts[2].isBlank()) return null
                return RotationGraceEntry(
                    previousRefreshTokenHash = parts[0],
                    currentRefreshTokenHash = parts[1],
                    maskedRotatedRefreshToken = parts[2],
                    expiresAt = Instant.ofEpochMilli(expiresAtMillis),
                )
            }
        }
    }

    private fun maskTokenWithSecret(
        plaintextToken: String,
        secretToken: String,
    ): String {
        val tokenBytes = plaintextToken.toByteArray(Charsets.UTF_8)
        val keyStream = deriveMaskBytes(secretToken, tokenBytes.size)
        val masked = ByteArray(tokenBytes.size) { index -> (tokenBytes[index].toInt() xor keyStream[index].toInt()).toByte() }
        return HexFormat.of().formatHex(masked)
    }

    private fun unmaskTokenWithSecret(
        maskedHex: String,
        secretToken: String,
    ): String? {
        val maskedBytes = runCatching { HexFormat.of().parseHex(maskedHex) }.getOrNull() ?: return null
        val keyStream = deriveMaskBytes(secretToken, maskedBytes.size)
        val unmasked = ByteArray(maskedBytes.size) { index -> (maskedBytes[index].toInt() xor keyStream[index].toInt()).toByte() }
        return String(unmasked, Charsets.UTF_8)
    }

    private fun deriveMaskBytes(
        secretToken: String,
        length: Int,
    ): ByteArray {
        val output = ByteArray(length)
        var offset = 0
        var counter = 0
        while (offset < length) {
            val digest =
                MessageDigest
                    .getInstance("SHA-256")
                    .digest("rotation-grace-mask:$counter:$secretToken".toByteArray(Charsets.UTF_8))
            val copyLength = minOf(digest.size, length - offset)
            System.arraycopy(digest, 0, output, offset, copyLength)
            offset += copyLength
            counter += 1
        }
        return output
    }

    companion object {
        val ROTATION_GRACE_WINDOW: Duration = Duration.ofSeconds(10)
        private const val ROTATION_GRACE_REDIS_KEY_PREFIX = "auth:session:refresh-grace:"
        private const val MAX_IN_MEMORY_GRACE_ENTRIES = 1_024
    }
}
