package com.back.global.security.config

object AuthCookieNames {
    const val API_KEY = "apiKey"
    const val ACCESS_TOKEN = "accessToken"
    const val REFRESH_TOKEN = "refreshToken"
    const val SESSION_KEY = "sessionKey"

    val AUTHENTICATION_COOKIE_NAMES: Set<String> =
        setOf(API_KEY, ACCESS_TOKEN, REFRESH_TOKEN, SESSION_KEY)

    val MUTATION_CSRF_GUARD_COOKIE_NAMES: Set<String> =
        setOf(API_KEY, ACCESS_TOKEN, SESSION_KEY)
}
