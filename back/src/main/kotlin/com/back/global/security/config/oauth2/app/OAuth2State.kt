package com.back.global.security.config.oauth2.app

import com.back.standard.extensions.base64Decode
import com.back.standard.extensions.base64Encode
import java.util.*

private const val DELIMITER = "#"
private const val DEFAULT_REDIRECT_URL = "/"

data class OAuth2State(
    val redirectUrl: String = DEFAULT_REDIRECT_URL,
    val originState: String = UUID.randomUUID().toString()
) {
    fun encode(): String = "$redirectUrl$DELIMITER$originState".base64Encode()

    companion object {
        fun of(redirectUrl: String): OAuth2State =
            OAuth2State(redirectUrl.takeIf { it.isNotBlank() } ?: DEFAULT_REDIRECT_URL)

        fun decode(encoded: String): OAuth2State {
            val decoded = encoded.base64Decode()
            val parts = decoded.split(DELIMITER, ignoreCase = false, limit = 2)

            return OAuth2State(
                parts.getOrNull(0)?.takeIf { it.isNotBlank() } ?: DEFAULT_REDIRECT_URL,
                parts.getOrNull(1).orEmpty()
            )
        }
    }
}
