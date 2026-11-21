package com.back.global.security.config

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
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
        if (!headerAuthorization.startsWith(BEARER_PREFIX)) {
            throw invalidBearerHeader()
        }

        val length = headerAuthorization.length
        var index = BEARER_PREFIX.length
        var firstStart = -1
        var firstEnd = -1
        var secondStart = -1
        var secondEnd = -1

        while (index < length) {
            while (index < length && headerAuthorization[index].isWhitespace()) {
                index++
            }
            if (index >= length) break

            val tokenStart = index
            while (index < length && !headerAuthorization[index].isWhitespace()) {
                index++
            }

            if (firstStart == -1) {
                firstStart = tokenStart
                firstEnd = index
            } else if (secondStart == -1) {
                secondStart = tokenStart
                secondEnd = index
            } else {
                throw invalidBearerHeader()
            }
        }

        if (firstStart == -1) {
            throw invalidBearerHeader()
        }

        val firstToken = headerAuthorization.substring(firstStart, firstEnd)
        return if (secondStart == -1) {
            ExtractedAuthTokens("", firstToken, sessionKey, refreshToken)
        } else {
            val secondToken = headerAuthorization.substring(secondStart, secondEnd)
            ExtractedAuthTokens(firstToken, secondToken, sessionKey, refreshToken)
        }
    }

    private fun invalidBearerHeader(): AppException =
        AppException(ErrorCode.INVALID_BEARER, "${HttpHeaders.AUTHORIZATION} 헤더가 Bearer 형식이 아닙니다.")

    private companion object {
        const val BEARER_PREFIX = "Bearer "
    }
}
