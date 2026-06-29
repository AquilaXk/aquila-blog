package com.back.global.web.application

import com.back.global.security.config.AuthCookieNames
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseCookie
import org.springframework.stereotype.Component
import java.time.Duration

/**
 * 인증 쿠키 발급/갱신/만료를 같은 이름 정책으로 처리합니다.
 *
 * 인증 쿠키는 host-only로 발급하고, 과거 configured-domain 쿠키는 함께 만료해
 * 브라우저에 같은 이름의 auth cookie가 중복으로 남지 않게 합니다.
 */
@Component
class AuthCookieService(
    private val rq: Rq,
    private val response: HttpServletResponse,
    @param:Value("\${custom.auth.cookie.apiKeyMaxAgeSeconds:2592000}")
    private val apiKeyCookieMaxAgeSeconds: Int,
    @param:Value("\${custom.accessToken.expirationSeconds:1200}")
    private val accessTokenCookieMaxAgeSeconds: Int,
    @param:Value("\${custom.auth.refreshToken.cookieMaxAgeSeconds:2592000}")
    private val refreshTokenCookieMaxAgeSeconds: Int,
) {
    fun issueAuthCookies(
        apiKey: String,
        accessToken: String,
        refreshToken: String,
        sessionKey: String? = null,
        rememberLoginEnabled: Boolean = true,
    ) {
        issueCookie(AuthCookieNames.API_KEY, apiKey, apiKeyCookieMaxAgeSeconds, sessionOnly = !rememberLoginEnabled)
        issueCookie(AuthCookieNames.ACCESS_TOKEN, accessToken, accessTokenCookieMaxAgeSeconds, sessionOnly = !rememberLoginEnabled)
        issueCookie(AuthCookieNames.REFRESH_TOKEN, refreshToken, refreshTokenCookieMaxAgeSeconds, sessionOnly = !rememberLoginEnabled)
        if (!sessionKey.isNullOrBlank()) {
            issueCookie(AuthCookieNames.SESSION_KEY, sessionKey, apiKeyCookieMaxAgeSeconds, sessionOnly = !rememberLoginEnabled)
        }
    }

    fun issueAccessToken(
        accessToken: String,
        rememberLoginEnabled: Boolean = true,
        sessionKey: String? = null,
        refreshToken: String? = null,
    ) {
        issueCookie(
            AuthCookieNames.ACCESS_TOKEN,
            accessToken,
            accessTokenCookieMaxAgeSeconds,
            sessionOnly = !rememberLoginEnabled,
        )
        if (!refreshToken.isNullOrBlank()) {
            issueCookie(
                AuthCookieNames.REFRESH_TOKEN,
                refreshToken,
                refreshTokenCookieMaxAgeSeconds,
                sessionOnly = !rememberLoginEnabled,
            )
        }
        if (!sessionKey.isNullOrBlank()) {
            issueCookie(AuthCookieNames.SESSION_KEY, sessionKey, apiKeyCookieMaxAgeSeconds, sessionOnly = !rememberLoginEnabled)
        }
    }

    fun expireAuthCookies() {
        AuthCookieNames.AUTHENTICATION_COOKIE_NAMES.forEach(::expireCookie)
    }

    private fun issueCookie(
        name: String,
        value: String,
        maxAgeSeconds: Int,
        sessionOnly: Boolean = false,
    ) {
        expireConfiguredDomainCookie(name)
        rq.setCookie(name, value, maxAgeSeconds, sessionOnly, useConfiguredDomain = false)
    }

    private fun expireCookie(name: String) {
        expireHostOnlyCookie(name)
        expireConfiguredDomainCookie(name)
    }

    private fun expireConfiguredDomainCookie(name: String) {
        rq.deleteCookie(name)
    }

    private fun expireHostOnlyCookie(name: String) {
        val hostOnlyCookie =
            ResponseCookie
                .from(name, "")
                .path("/")
                .httpOnly(true)
                .secure(true)
                .sameSite("Strict")
                .maxAge(Duration.ZERO)
                .build()

        response.addHeader(HttpHeaders.SET_COOKIE, hostOnlyCookie.toString())
    }
}
