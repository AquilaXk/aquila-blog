package com.back.boundedContexts.post.adapter.web

import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component

@Component
class PostPublicReadCacheHeaderWriter(
    private val serverTimingWriter: PostPublicReadServerTimingWriter = PostPublicReadServerTimingWriter(),
) {
    fun applyPublicReadCacheHeaders(
        response: HttpServletResponse,
        policy: PublicReadCachePolicy,
        surrogateKeys: Set<String>,
    ) {
        if (hasCredentialHeaders(response)) {
            applyPrivateNoStoreHeaders(response)
            ensurePrivateVaryHeader(response)
            return
        }
        val safeMaxAge = policy.maxAgeSeconds.coerceAtLeast(0)
        val safeSharedMaxAge = policy.sharedMaxAgeSeconds.coerceAtLeast(safeMaxAge)
        val safeSWR = policy.staleWhileRevalidateSeconds.coerceAtLeast(0)
        val staleIfError = (safeSharedMaxAge + safeSWR).coerceAtLeast(safeSWR)
        response.setHeader(
            "Cache-Control",
            "public, max-age=$safeMaxAge, s-maxage=$safeSharedMaxAge, stale-while-revalidate=$safeSWR, stale-if-error=$staleIfError",
        )
        response.setHeader("X-Cache-Policy", policy.name)
        applySurrogateKeyHeaders(response, surrogateKeys)
        serverTimingWriter.appendMetric(response, "cache-policy;desc=\"${policy.name}\"")
    }

    fun applyPrivateNoStoreHeaders(response: HttpServletResponse) {
        response.setHeader("Cache-Control", "private, no-store, max-age=0")
    }

    private fun hasCredentialHeaders(response: HttpServletResponse): Boolean {
        if (response.containsHeader(HttpHeaders.AUTHORIZATION) || response.containsHeader(HttpHeaders.SET_COOKIE)) {
            return true
        }
        return response.headerNames.orEmpty().any { headerName ->
            headerName.equals(HttpHeaders.AUTHORIZATION, ignoreCase = true) ||
                headerName.equals(HttpHeaders.SET_COOKIE, ignoreCase = true)
        }
    }

    private fun ensurePrivateVaryHeader(response: HttpServletResponse) {
        val existingTokens =
            response
                .getHeaders(HttpHeaders.VARY)
                .orEmpty()
                .flatMap { it.split(',') }
                .map { it.trim() }
                .filter { it.isNotEmpty() }
        if (existingTokens.any { it == "*" }) return
        val merged = linkedSetOf<String>()
        existingTokens.forEach { merged.add(it) }
        if (merged.none { it.equals(HttpHeaders.AUTHORIZATION, ignoreCase = true) }) {
            merged.add(HttpHeaders.AUTHORIZATION)
        }
        if (merged.none { it.equals(HttpHeaders.COOKIE, ignoreCase = true) }) {
            merged.add(HttpHeaders.COOKIE)
        }
        response.setHeader(HttpHeaders.VARY, merged.joinToString(", "))
    }

    fun applySurrogateKeyHeaders(
        response: HttpServletResponse,
        surrogateKeys: Set<String>,
    ) {
        val normalized =
            surrogateKeys
                .asSequence()
                .map(::normalizeCacheTagToken)
                .filter { it.isNotBlank() }
                .distinct()
                .toList()
        if (normalized.isEmpty()) return
        response.setHeader("Surrogate-Key", normalized.joinToString(" "))
        response.setHeader("Cache-Tag", normalized.joinToString(","))
    }

    private fun normalizeCacheTagToken(raw: String): String =
        raw
            .trim()
            .lowercase()
            .replace(Regex("[^a-z0-9:_-]"), "-")
            .replace(Regex("-+"), "-")
            .trim('-')
            .take(MAX_CACHE_TAG_LENGTH)

    private companion object {
        private const val MAX_CACHE_TAG_LENGTH = 64
    }
}
