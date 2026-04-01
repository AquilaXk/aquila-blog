package com.back.global.security.application

import com.back.global.web.application.IpAddressNormalizer
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets.UTF_8
import java.security.MessageDigest
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * 로그인 IP 보안용 지문(fingerprint) 계산과 검증을 담당합니다.
 * 원본 IP를 저장하지 않고 HMAC 기반 해시만 보관해 개인정보 노출을 줄입니다.
 */
@Service
class AuthIpSecurityService(
    @param:Value("\${custom.auth.ipSecurity.hashSecret:}")
    private val configuredHashSecret: String,
    @param:Value("\${custom.jwt.secretKey}")
    private val jwtSecretKey: String,
) {
    fun fingerprint(clientIp: String): String? {
        val normalizedIp = normalizeIp(clientIp) ?: return null
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(resolveSecret().toByteArray(UTF_8), "HmacSHA256"))
        val digest = mac.doFinal(normalizedIp.toByteArray(UTF_8))
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest)
    }

    fun matches(
        expectedFingerprint: String?,
        clientIp: String,
    ): Boolean {
        if (expectedFingerprint.isNullOrBlank()) return false
        val actualFingerprint = fingerprint(clientIp) ?: return false
        return MessageDigest.isEqual(
            expectedFingerprint.toByteArray(UTF_8),
            actualFingerprint.toByteArray(UTF_8),
        )
    }

    private fun resolveSecret(): String = configuredHashSecret.ifBlank { jwtSecretKey }

    private fun normalizeIp(clientIp: String): String? = IpAddressNormalizer.normalize(clientIp)
}
