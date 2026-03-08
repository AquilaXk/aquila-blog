package com.back.global.session.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.session.web.http.CookieHttpSessionIdResolver
import org.springframework.session.web.http.HttpSessionIdResolver

@Configuration
class SessionConfig {
    private val sessionPathsPrefixes = listOf(
        "/oauth2/",
        "/login/oauth2/"
    )

    @Bean
    fun httpSessionIdResolver(): HttpSessionIdResolver {
        val delegate = CookieHttpSessionIdResolver()

        return object : HttpSessionIdResolver {
            override fun resolveSessionIds(request: HttpServletRequest): MutableList<String> {
                if (!shouldUseSession(request.requestURI)) return mutableListOf()
                return delegate.resolveSessionIds(request)
            }

            override fun setSessionId(request: HttpServletRequest, response: HttpServletResponse, sessionId: String) {
                if (!shouldUseSession(request.requestURI)) return
                delegate.setSessionId(request, response, sessionId)
            }

            override fun expireSession(request: HttpServletRequest, response: HttpServletResponse) {
                if (!shouldUseSession(request.requestURI)) return
                delegate.expireSession(request, response)
            }

            private fun shouldUseSession(uri: String): Boolean =
                sessionPathsPrefixes.any { uri.startsWith(it) }
        }
    }
}
