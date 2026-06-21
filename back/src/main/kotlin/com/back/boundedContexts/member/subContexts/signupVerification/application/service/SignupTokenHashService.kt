package com.back.boundedContexts.member.subContexts.signupVerification.application.service

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets.UTF_8
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

@Service
class SignupTokenHashService(
    @param:Value("\${custom.member.signup.tokenHashSecret:}")
    private val configuredTokenHashSecret: String,
    @param:Value("\${custom.jwt.secretKey}")
    private val jwtSecretKey: String,
) {
    fun emailVerificationTokenHash(rawToken: String): String = digest("email-verification", rawToken)

    fun signupSessionTokenHash(rawToken: String): String = digest("signup-session", rawToken)

    private fun digest(
        purpose: String,
        rawToken: String,
    ): String {
        val normalizedToken = rawToken.trim()
        require(normalizedToken.isNotBlank()) { "signup token must not be blank" }

        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(SecretKeySpec(resolveSecret().toByteArray(UTF_8), HMAC_ALGORITHM))
        val digest = mac.doFinal("$purpose:$normalizedToken".toByteArray(UTF_8))
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest)
    }

    private fun resolveSecret(): String =
        configuredTokenHashSecret
            .ifBlank { jwtSecretKey }
            .ifBlank { error("custom.member.signup.tokenHashSecret or custom.jwt.secretKey is required") }

    companion object {
        private const val HMAC_ALGORITHM = "HmacSHA256"
    }
}
