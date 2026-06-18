package com.back.global.security.config

import com.back.global.exception.application.AppException
import com.back.global.web.application.Rq
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component

/**
 * 인증 필터가 사용할 Authorization header와 auth cookie 값을 한 곳에서 파싱합니다.
 */
@Component
class AuthTokenExtractor(
    private val rq: Rq,
) {
    fun extract(): ExtractedAuthTokens {
        val headerAuthorization = rq.getHeader(HttpHeaders.AUTHORIZATION, "").orEmpty()
        val sessionKey = rq.getCookieValue(AuthCookieNames.SESSION_KEY, "").orEmpty()
        val refreshToken = rq.getCookieValue(AuthCookieNames.REFRESH_TOKEN, "").orEmpty()

        return if (headerAuthorization.isNotBlank()) {
            extractBearerTokens(headerAuthorization, sessionKey, refreshToken)
        } else {
            ExtractedAuthTokens(
                apiKey = rq.getCookieValue(AuthCookieNames.API_KEY, "").orEmpty(),
                accessToken = rq.getCookieValue(AuthCookieNames.ACCESS_TOKEN, "").orEmpty(),
                sessionKey = sessionKey,
                refreshToken = refreshToken,
            )
        }
    }

    private fun extractBearerTokens(
        headerAuthorization: String,
        sessionKey: String,
        refreshToken: String,
    ): ExtractedAuthTokens {
        if (!headerAuthorization.startsWith("Bearer ")) {
            throw invalidBearerHeader()
        }

        val bits = headerAuthorization.trim().split(Regex("\\s+"))
        return when (bits.size) {
            2 -> {
                ExtractedAuthTokens("", bits[1], sessionKey, refreshToken)
            }
            3 -> {
                ExtractedAuthTokens(bits[1], bits[2], sessionKey, refreshToken)
            }
            else -> throw invalidBearerHeader()
        }
    }

    private fun invalidBearerHeader(): AppException = AppException("401-2", "${HttpHeaders.AUTHORIZATION} 헤더가 Bearer 형식이 아닙니다.")
}
