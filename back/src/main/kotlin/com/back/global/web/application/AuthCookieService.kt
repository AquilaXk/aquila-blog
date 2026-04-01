package com.back.global.web.application

import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseCookie
import org.springframework.stereotype.Component
import java.time.Duration

/**
 * AuthCookieService는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */

@Component
class AuthCookieService(
    private val rq: Rq,
    private val response: HttpServletResponse,
    @param:Value("\${custom.auth.cookie.apiKeyMaxAgeSeconds:2592000}")
    private val apiKeyCookieMaxAgeSeconds: Int,
    @param:Value("\${custom.accessToken.expirationSeconds:1200}")
    private val accessTokenCookieMaxAgeSeconds: Int,
) {
    fun issueAuthCookies(
        apiKey: String,
        accessToken: String,
        sessionKey: String? = null,
        rememberLoginEnabled: Boolean = true,
    ) {
        issueCookie("apiKey", apiKey, apiKeyCookieMaxAgeSeconds, sessionOnly = !rememberLoginEnabled)
        issueCookie("accessToken", accessToken, accessTokenCookieMaxAgeSeconds, sessionOnly = !rememberLoginEnabled)
        if (!sessionKey.isNullOrBlank()) {
            issueCookie("sessionKey", sessionKey, apiKeyCookieMaxAgeSeconds, sessionOnly = !rememberLoginEnabled)
        }
    }

    fun issueAccessToken(
        accessToken: String,
        rememberLoginEnabled: Boolean = true,
        sessionKey: String? = null,
    ) {
        issueCookie(
            "accessToken",
            accessToken,
            accessTokenCookieMaxAgeSeconds,
            sessionOnly = !rememberLoginEnabled,
        )
        if (!sessionKey.isNullOrBlank()) {
            issueCookie("sessionKey", sessionKey, apiKeyCookieMaxAgeSeconds, sessionOnly = !rememberLoginEnabled)
        }
    }

    fun expireAuthCookies() {
        expireCookie("apiKey")
        expireCookie("accessToken")
        expireCookie("sessionKey")
    }

    private fun issueCookie(
        name: String,
        value: String,
        maxAgeSeconds: Int,
        sessionOnly: Boolean = false,
    ) {
        // 이전 배포에서 남았을 수 있는 host-only 쿠키를 먼저 제거한 뒤,
        // 현재 표준인 domain cookie 한 종류만 유지한다.
        expireHostOnlyCookie(name)
        rq.setCookie(name, value, maxAgeSeconds, sessionOnly)
    }

    private fun expireCookie(name: String) {
        expireHostOnlyCookie(name)
        rq.deleteCookie(name)
    }

    /**
     * 쿠키 속성을 정책에 맞게 설정하고 보안 플래그를 강제합니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
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
