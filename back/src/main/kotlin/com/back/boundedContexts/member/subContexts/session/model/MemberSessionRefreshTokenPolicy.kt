package com.back.boundedContexts.member.subContexts.session.model

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

object MemberSessionRefreshTokenPolicy {
    private val secureRandom = SecureRandom()
    private val encoder: Base64.Encoder = Base64.getUrlEncoder().withoutPadding()

    fun generate(): String {
        val bytes = ByteArray(32)
        secureRandom.nextBytes(bytes)
        return encoder.encodeToString(bytes)
    }

    fun hash(refreshToken: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(refreshToken.toByteArray(StandardCharsets.UTF_8))
        return encoder.encodeToString(digest)
    }

    fun matchesHash(
        expectedHash: String?,
        rawRefreshToken: String,
    ): Boolean = constantTimeEquals(expectedHash, hash(rawRefreshToken))

    fun constantTimeEquals(
        expected: String?,
        actual: String?,
    ): Boolean {
        if (expected == null || actual == null) return false
        return MessageDigest.isEqual(
            expected.toByteArray(StandardCharsets.UTF_8),
            actual.toByteArray(StandardCharsets.UTF_8),
        )
    }
}
