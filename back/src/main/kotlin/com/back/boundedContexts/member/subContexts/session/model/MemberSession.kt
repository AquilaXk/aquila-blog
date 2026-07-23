package com.back.boundedContexts.member.subContexts.session.model

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType.SEQUENCE
import jakarta.persistence.Id
import jakarta.persistence.ManyToOne
import jakarta.persistence.SequenceGenerator
import java.time.Instant

/**
 * MemberSession은 디바이스 단위 로그인 세션 정책(remember/ip-security)을 보관한다.
 */
@Entity
class MemberSession(
    @field:Id
    @field:SequenceGenerator(name = "member_session_seq_gen", sequenceName = "member_session_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "member_session_seq_gen")
    override val id: Long = 0,
    @field:ManyToOne(fetch = FetchType.LAZY)
    val member: Member,
    @field:Column(unique = true, nullable = false, length = 96)
    var sessionKey: String,
    @field:Column(nullable = false)
    var rememberLoginEnabled: Boolean = true,
    @field:Column(nullable = false)
    var ipSecurityEnabled: Boolean = false,
    @field:Column(length = 96)
    var ipSecurityFingerprint: String? = null,
    @field:Column(length = 128)
    var createdIp: String? = null,
    @field:Column(length = 512)
    var userAgent: String? = null,
    @field:Column(length = 128)
    var refreshTokenHash: String? = null,
    var refreshTokenExpiresAt: Instant? = null,
    var refreshTokenRotatedAt: Instant? = null,
    var refreshTokenReusedAt: Instant? = null,
    var lastAuthenticatedAt: Instant? = null,
    var revokedAt: Instant? = null,
) : BaseTime(id) {
    fun revoke(now: Instant = Instant.now()) {
        revokedAt = now
    }

    fun touchAuthenticated(now: Instant = Instant.now()) {
        lastAuthenticatedAt = now
    }

    fun bindRefreshToken(
        refreshToken: String,
        expiresAt: Instant,
        now: Instant = Instant.now(),
    ) {
        refreshTokenHash = MemberSessionRefreshTokenPolicy.hash(refreshToken)
        refreshTokenExpiresAt = expiresAt
        refreshTokenRotatedAt = now
        refreshTokenReusedAt = null
    }

    fun matchesRefreshToken(
        refreshToken: String,
        now: Instant = Instant.now(),
    ): Boolean {
        val storedHash = refreshTokenHash ?: return false
        val expiresAt = refreshTokenExpiresAt ?: return false
        if (!now.isBefore(expiresAt)) return false
        return storedHash == MemberSessionRefreshTokenPolicy.hash(refreshToken)
    }

    fun isRefreshTokenExpired(now: Instant = Instant.now()): Boolean {
        val expiresAt = refreshTokenExpiresAt ?: return true
        return !now.isBefore(expiresAt)
    }

    fun markRefreshTokenReused(now: Instant = Instant.now()) {
        refreshTokenReusedAt = now
        revoke(now)
    }

    fun touchAuthenticatedIfDue(
        minIntervalSeconds: Long,
        now: Instant = Instant.now(),
    ): Boolean {
        if (minIntervalSeconds <= 0) {
            touchAuthenticated(now)
            return true
        }

        val lastTouchedAt = lastAuthenticatedAt
        if (lastTouchedAt != null && now.isBefore(lastTouchedAt.plusSeconds(minIntervalSeconds))) {
            return false
        }

        touchAuthenticated(now)
        return true
    }

    fun applyPolicy(
        rememberLoginEnabled: Boolean,
        ipSecurityEnabled: Boolean,
        ipSecurityFingerprint: String?,
    ) {
        this.rememberLoginEnabled = rememberLoginEnabled
        this.ipSecurityEnabled = ipSecurityEnabled
        this.ipSecurityFingerprint =
            if (ipSecurityEnabled) {
                ipSecurityFingerprint
            } else {
                null
            }
    }
}
