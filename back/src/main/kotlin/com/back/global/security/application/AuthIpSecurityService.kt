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
    private val hmacKeySpec =
        SecretKeySpec(
            configuredHashSecret.ifBlank { jwtSecretKey }.toByteArray(UTF_8),
            HMAC_ALGORITHM,
        )

    fun fingerprint(clientIp: String): String? {
        val normalizedIp = IpAddressNormalizer.normalize(clientIp) ?: return null
        return BASE64_URL_NO_PAD.encodeToString(hmacSha256(normalizedIp))
    }

    fun matches(
        expectedFingerprint: String?,
        clientIp: String,
    ): Boolean {
        if (expectedFingerprint.isNullOrBlank() || expectedFingerprint.length != FINGERPRINT_BASE64_LENGTH) {
            return false
        }
        val normalizedIp = IpAddressNormalizer.normalize(clientIp) ?: return false
        val actualEncodedBytes = BASE64_URL_NO_PAD.encode(hmacSha256(normalizedIp))
        return MessageDigest.isEqual(
            expectedFingerprint.toByteArray(UTF_8),
            actualEncodedBytes,
        )
    }

    private fun hmacSha256(normalizedIp: String): ByteArray {
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(hmacKeySpec)
        return mac.doFinal(normalizedIp.toByteArray(UTF_8))
    }

    companion object {
        private const val HMAC_ALGORITHM = "HmacSHA256"
        private const val FINGERPRINT_BASE64_LENGTH = 43
        private val BASE64_URL_NO_PAD = Base64.getUrlEncoder().withoutPadding()
    }
}
