package com.back.global.security.config.oauth2.application

import com.back.global.app.AppConfig
import com.back.standard.extensions.base64Decode
import com.back.standard.extensions.base64Encode
import java.net.URI
import java.util.*

private const val DELIMITER = "#"
private const val DEFAULT_REDIRECT_URL = "/"

/**
 * OAuth2State는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */
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

        /**
         * 입력/환경 데이터를 파싱·정규화해 내부 처리에 안전한 값으로 변환합니다.
         * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
         */
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
