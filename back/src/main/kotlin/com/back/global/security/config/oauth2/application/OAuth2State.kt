package com.back.global.security.config.oauth2.application

import com.back.global.app.AppConfig
import com.back.standard.extensions.base64Decode
import com.back.standard.extensions.base64Encode
import java.net.URI
import java.util.*

private const val DELIMITER = "#"
private const val DEFAULT_REDIRECT_URL = "/"

data class OAuth2State(
    val redirectUrl: String = DEFAULT_REDIRECT_URL,
    val originState: String = UUID.randomUUID().toString(),
) {
    fun encode(): String = "$redirectUrl$DELIMITER$originState".base64Encode()

    companion object {
        fun of(redirectUrl: String): OAuth2State = OAuth2State(normalizeRedirectUrl(redirectUrl))

        fun decode(encoded: String): OAuth2State {
            val decoded = encoded.base64Decode()
            val parts = decoded.split(DELIMITER, ignoreCase = false, limit = 2)

            return OAuth2State(
                normalizeRedirectUrl(parts.getOrNull(0).orEmpty()),
                parts.getOrNull(1).orEmpty(),
            )
        }

        private fun normalizeRedirectUrl(raw: String): String {
            val redirectUrl = raw.trim()
            if (redirectUrl.isBlank()) return DEFAULT_REDIRECT_URL

            if (redirectUrl.startsWith("/")) {
                // protocol-relative URL(//evil.com) 차단
                if (redirectUrl.startsWith("//")) return DEFAULT_REDIRECT_URL
                return redirectUrl
            }

            val targetUri = runCatching { URI(redirectUrl) }.getOrNull() ?: return DEFAULT_REDIRECT_URL
            val allowedUri = runCatching { URI(AppConfig.siteFrontUrl) }.getOrNull() ?: return DEFAULT_REDIRECT_URL
            if (!targetUri.isAbsolute) return DEFAULT_REDIRECT_URL

            val sameScheme = targetUri.scheme.equals(allowedUri.scheme, ignoreCase = true)
            val sameHost = targetUri.host.orEmpty().equals(allowedUri.host.orEmpty(), ignoreCase = true)
            val samePort = normalizePort(targetUri) == normalizePort(allowedUri)
            return if (sameScheme && sameHost && samePort) targetUri.toString() else DEFAULT_REDIRECT_URL
        }

        private fun normalizePort(uri: URI): Int =
            when {
                uri.port != -1 -> uri.port
                uri.scheme.equals("https", ignoreCase = true) -> 443
                else -> 80
            }
    }
}
