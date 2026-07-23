package com.back.global.security.config

import jakarta.servlet.http.HttpServletRequest
import org.springframework.stereotype.Component

@Component
class PublicApiRequestMatcher(
    contributors: List<PublicApiRouteContributor>,
) {
    private val routes =
        contributors
            .flatMap(PublicApiRouteContributor::publicApiRoutes)

    fun matches(request: HttpServletRequest): Boolean = routes.any { it.matches(request) }

    fun matches(
        method: String,
        path: String,
    ): Boolean = routes.any { it.matches(method, path) }

    fun isPublicReadSafe(
        method: String,
        path: String,
    ): Boolean {
        val normalized = method.uppercase()
        return normalized in SAFE_METHODS && matches(normalized, path)
    }

    /**
     * Caddy `@publicReadFallback` / `back_read`와 동일한 edge public-read subset.
     * runtime split(READ/ADMIN) 판정은 이 subset을 사용한다.
     */
    fun isEdgePublicReadSafe(
        method: String,
        path: String,
    ): Boolean {
        val normalized = method.uppercase()
        if (normalized !in SAFE_METHODS) return false
        return routes.any { route ->
            PublicApiCaddyReadPaths.isEdgePublicReadRoute(route.pattern) &&
                route.matches(normalized, path)
        }
    }

    fun publicApiRoutes(): List<PublicApiRouteSpec> = routes

    fun edgePublicReadCaddyPaths(): Set<String> = PublicApiCaddyReadPaths.export(routes)

    companion object {
        private val SAFE_METHODS = setOf("GET", "HEAD")
    }
}
