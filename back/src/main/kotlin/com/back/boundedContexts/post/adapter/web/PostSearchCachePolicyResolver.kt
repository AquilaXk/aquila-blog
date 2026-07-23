package com.back.boundedContexts.post.adapter.web

import org.springframework.stereotype.Component

@Component
class PostSearchCachePolicyResolver {
    fun resolve(keyword: String): PublicReadCachePolicy {
        val normalized = keyword.trim()
        if (normalized.isBlank()) return PostPublicReadCachePolicies.SEARCH_DEFAULT
        if (isHighEntropyKeyword(normalized)) return PostPublicReadCachePolicies.SEARCH_NO_STORE
        if (normalized.length >= SEARCH_SHORT_TTL_KEYWORD_LENGTH) return PostPublicReadCachePolicies.SEARCH_SHORT
        return PostPublicReadCachePolicies.SEARCH_DEFAULT
    }

    private fun isHighEntropyKeyword(keyword: String): Boolean {
        if (keyword.length >= SEARCH_NO_STORE_KEYWORD_LENGTH) return true

        val tokens = keyword.split(Regex("\\s+")).filter { it.isNotBlank() }
        if (tokens.size >= SEARCH_NO_STORE_TOKEN_COUNT) return true

        val alphaNumeric = keyword.filter { it.isLetterOrDigit() }
        if (alphaNumeric.length < SEARCH_HIGH_ENTROPY_MIN_LENGTH) return false

        val uniqueRatio =
            alphaNumeric
                .lowercase()
                .toSet()
                .size
                .toDouble() / alphaNumeric.length
        return uniqueRatio >= SEARCH_HIGH_ENTROPY_UNIQUE_RATIO_THRESHOLD
    }

    private companion object {
        private const val SEARCH_SHORT_TTL_KEYWORD_LENGTH = 16
        private const val SEARCH_NO_STORE_KEYWORD_LENGTH = 28
        private const val SEARCH_NO_STORE_TOKEN_COUNT = 4
        private const val SEARCH_HIGH_ENTROPY_MIN_LENGTH = 16
        private const val SEARCH_HIGH_ENTROPY_UNIQUE_RATIO_THRESHOLD = 0.58
    }
}
