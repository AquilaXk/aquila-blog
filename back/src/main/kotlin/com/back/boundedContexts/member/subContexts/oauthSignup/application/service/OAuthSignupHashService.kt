package com.back.boundedContexts.member.subContexts.oauthSignup.application.service

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets.UTF_8
import java.util.Base64
import java.util.Locale
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

@Service
class OAuthSignupHashService(
    @param:Value("\${custom.member.oauthSignup.tokenHashSecret:}")
    private val configuredOAuthSignupSecret: String,
    @param:Value("\${custom.member.signup.tokenHashSecret:}")
    private val configuredSignupSecret: String,
    @param:Value("\${custom.jwt.secretKey}")
    private val jwtSecretKey: String,
) {
    fun pendingTokenHash(rawToken: String): String = digest("oauth-signup-pending-token", rawToken)

    fun providerSubjectHash(
        provider: String,
        providerSubject: String,
    ): String {
        val normalizedProvider = normalizeProvider(provider)
        val normalizedSubject = providerSubject.trim()
        require(normalizedSubject.isNotBlank()) { "oauth provider subject must not be blank" }

        return digest("oauth-provider-subject:$normalizedProvider", normalizedSubject)
    }

    fun memberLoginId(
        provider: String,
        providerSubjectHash: String,
    ): String {
        val normalizedProvider = normalizeProvider(provider)
        val normalizedHash = providerSubjectHash.trim()
        require(normalizedHash.isNotBlank()) { "oauth provider subject hash must not be blank" }

        return "${normalizedProvider}__${normalizedHash.take(LOGIN_ID_HASH_LENGTH)}"
    }

    private fun digest(
        purpose: String,
        rawValue: String,
    ): String {
        val normalizedValue = rawValue.trim()
        require(normalizedValue.isNotBlank()) { "$purpose value must not be blank" }

        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(SecretKeySpec(resolveSecret().toByteArray(UTF_8), HMAC_ALGORITHM))
        val digest = mac.doFinal("$purpose:$normalizedValue".toByteArray(UTF_8))
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest)
    }

    private fun resolveSecret(): String =
        configuredOAuthSignupSecret
            .ifBlank { configuredSignupSecret }
            .ifBlank { jwtSecretKey }
            .ifBlank { error("custom.member.oauthSignup.tokenHashSecret or custom.jwt.secretKey is required") }

    private fun normalizeProvider(provider: String): String =
        provider
            .trim()
            .uppercase(Locale.ROOT)
            .ifBlank { throw IllegalArgumentException("oauth provider must not be blank") }

    companion object {
        private const val HMAC_ALGORITHM = "HmacSHA256"
        private const val LOGIN_ID_HASH_LENGTH = 43
    }
}
