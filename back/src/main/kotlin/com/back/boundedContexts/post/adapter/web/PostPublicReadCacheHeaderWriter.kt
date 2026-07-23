package com.back.boundedContexts.post.adapter.web

import jakarta.servlet.http.HttpServletResponse
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
