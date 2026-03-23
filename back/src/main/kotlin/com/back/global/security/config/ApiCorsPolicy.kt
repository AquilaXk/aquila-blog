package com.back.global.security.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.env.Environment
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component
import org.springframework.web.cors.CorsConfiguration
import java.net.URI

/**
 * ApiCorsPolicy는 API 응답 CORS 정책을 단일 지점에서 관리합니다.
 * 보안 예외(401/403) 응답에서도 허용 오리진이면 동일한 CORS 헤더를 강제해
 * 브라우저가 상태 코드를 정상적으로 해석할 수 있도록 보장합니다.
 */
@Component
class ApiCorsPolicy(
    private val environment: Environment,
    @Value("\${custom.site.frontUrl:}")
    private val siteFrontUrl: String,
    @Value("\${custom.site.backUrl:}")
    private val siteBackUrl: String,
    @Value("\${custom.site.cookieDomain:}")
    private val siteCookieDomain: String,
) {
    private val configuration =
        CorsConfiguration().apply {
            allowedOriginPatterns = buildAllowedOriginPatterns()
            allowedMethods = listOf("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
            allowedHeaders = listOf("*")
            allowCredentials = true
            maxAge = 1800
        }

    fun corsConfiguration(): CorsConfiguration = CorsConfiguration(configuration)

    /**
     * 허용된 Origin 요청인 경우 응답 헤더에 CORS 필드를 보강합니다.
     * 인증 실패/인가 실패 응답에서도 헤더가 유지되도록 Security 예외 경로에서 호출합니다.
     */
    fun applyResponseHeadersIfAllowed(
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val origin = request.getHeader(HttpHeaders.ORIGIN)?.trim().orEmpty()
        if (origin.isBlank()) return

        val allowedOrigin = configuration.checkOrigin(origin) ?: return
        response.setHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, allowedOrigin)
        if (configuration.allowCredentials == true) {
            response.setHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true")
        }
        appendVaryHeader(response, "Origin")
        appendVaryHeader(response, "Access-Control-Request-Method")
        appendVaryHeader(response, "Access-Control-Request-Headers")
    }

    private fun buildAllowedOriginPatterns(): List<String> {
        val cookieDomain = siteCookieDomain.trim()
        val isProd = environment.matchesProfiles("prod")
        val configuredOrigins =
            buildList {
                add(siteFrontUrl)
                add(siteBackUrl)
                if (cookieDomain.isNotBlank()) {
                    add("https://$cookieDomain")
                    add("https://www.$cookieDomain")
                }
                if (!isProd) {
                    add("http://localhost:*")
                    add("http://127.0.0.1:*")
                }
            }

        return configuredOrigins
            .mapNotNull(::normalizeOriginPattern)
            .distinct()
    }

    private fun normalizeOriginPattern(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val trimmed = raw.trim()
        if (trimmed.isBlank()) return null

        // localhost:* 패턴처럼 CORS 패턴 문법이 이미 포함된 값은 그대로 사용한다.
        if (trimmed.endsWith(":*")) return trimmed

        return runCatching {
            val uri = URI(trimmed)
            val scheme = uri.scheme?.lowercase().orEmpty()
            val host = uri.host?.lowercase().orEmpty()
            if (scheme.isBlank() || host.isBlank()) return@runCatching null
            val portSuffix = if (uri.port > 0) ":${uri.port}" else ""
            "$scheme://$host$portSuffix"
        }.getOrNull()
    }

    private fun appendVaryHeader(
        response: HttpServletResponse,
        token: String,
    ) {
        val existing = response.getHeader(HttpHeaders.VARY).orEmpty()
        if (existing.isBlank()) {
            response.setHeader(HttpHeaders.VARY, token)
            return
        }

        val tokens =
            existing
                .split(",")
                .map { it.trim() }
                .filter { it.isNotBlank() }
                .toMutableSet()
        if (tokens.add(token)) {
            response.setHeader(HttpHeaders.VARY, tokens.joinToString(", "))
        }
    }
}
