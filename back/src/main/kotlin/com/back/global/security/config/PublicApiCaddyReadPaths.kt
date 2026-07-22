package com.back.global.security.config

import org.springframework.http.HttpMethod

/**
 * Edge `@publicReadFallback` path set derived from [PublicApiRouteSpec] SoT.
 * Only SAFE (GET/HEAD) post/cloud public-read routes are exported for Caddy read upstream.
 */
object PublicApiCaddyReadPaths {
    fun export(routes: List<PublicApiRouteSpec>): Set<String> =
        routes
            .asSequence()
            .filter { route -> route.method == null || route.method == HttpMethod.GET || route.method == HttpMethod.HEAD }
            .filter { route -> isEdgePublicReadRoute(route.pattern) }
            .map { route -> toCaddyPath(route.pattern) }
            .toSortedSet()

    fun isEdgePublicReadRoute(pattern: String): Boolean =
        pattern.startsWith("/post/api/") ||
            (pattern.contains("/cloud/files/") && pattern.contains("external-content"))

    fun toCaddyPath(pattern: String): String {
        var path = pattern
        path = path.replace("/api/*/", "/api/v1/")
        path = path.replace(Regex("\\{[^}]+\\}"), "*")
        path = path.replace("/**", "/*")
        return path
    }
}
