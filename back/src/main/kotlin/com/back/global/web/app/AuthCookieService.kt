package com.back.global.web.app

import jakarta.servlet.http.Cookie
import jakarta.servlet.http.HttpServletResponse
import org.springframework.stereotype.Component

@Component
class AuthCookieService(
    private val rq: Rq,
    private val response: HttpServletResponse,
) {
    fun issueAuthCookies(
        apiKey: String,
        accessToken: String,
    ) {
        issueCookie("apiKey", apiKey)
        issueCookie("accessToken", accessToken)
    }

    fun issueAccessToken(accessToken: String) {
        issueCookie("accessToken", accessToken)
    }

    fun expireAuthCookies() {
        expireCookie("apiKey")
        expireCookie("accessToken")
    }

    private fun issueCookie(
        name: String,
        value: String,
    ) {
        // 이전 배포에서 남았을 수 있는 host-only 쿠키를 먼저 제거한 뒤,
        // 현재 표준인 domain cookie 한 종류만 유지한다.
        expireHostOnlyCookie(name)
        rq.setCookie(name, value)
    }

    private fun expireCookie(name: String) {
        expireHostOnlyCookie(name)
        rq.deleteCookie(name)
    }

    private fun expireHostOnlyCookie(name: String) {
        response.addCookie(
            Cookie(name, "").apply {
                path = "/"
                isHttpOnly = true
                maxAge = 0
            },
        )
    }
}
