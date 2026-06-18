package com.back.boundedContexts.post.adapter.web

import org.springframework.stereotype.Component

data class PostSearchIntent(
    val keyword: String,
    val tag: String,
)

@Component
class PostSearchIntentResolver {
    fun resolve(
        rawKeyword: String,
        rawTag: String,
    ): PostSearchIntent {
        val normalizedKeyword = normalizeKeyword(rawKeyword)
        val normalizedTag = normalizeTag(rawTag)
        if (normalizedTag.isNotBlank()) {
            return PostSearchIntent(keyword = normalizedKeyword, tag = normalizedTag)
        }

        val hashtagIntent = resolveHashtagIntent(normalizedKeyword)
        if (hashtagIntent != null) {
            return hashtagIntent
        }

        val prefixedTag = resolvePrefixedTag(normalizedKeyword)
        if (prefixedTag.isNotBlank()) {
            return PostSearchIntent(keyword = "", tag = normalizeTag(prefixedTag))
        }

        return PostSearchIntent(keyword = normalizedKeyword, tag = "")
    }

    private fun resolveHashtagIntent(normalizedKeyword: String): PostSearchIntent? {
        val hashMatchedTag =
            HASHTAG_REGEX
                .find(normalizedKeyword)
                ?.groupValues
                ?.getOrNull(2)
                .orEmpty()
        if (hashMatchedTag.isBlank()) return null

        // Hashtag 의도는 태그 필터로 승격하고, 남은 텍스트는 keyword 검색어로 유지한다.
        val cleanedKeyword =
            HASHTAG_REGEX
                .replace(normalizedKeyword, " ")
                .replace(WHITESPACE_REGEX, " ")
                .trim()

        return PostSearchIntent(
            keyword = cleanedKeyword.take(MAX_KEYWORD_LENGTH),
            tag = normalizeTag(hashMatchedTag),
        )
    }

    private fun resolvePrefixedTag(normalizedKeyword: String): String =
        PREFIXED_TAG_REGEX
            .find(normalizedKeyword)
            ?.groupValues
            ?.getOrNull(1)
            .orEmpty()

    private fun normalizeKeyword(raw: String): String = normalizeSearchToken(raw, MAX_KEYWORD_LENGTH)

    private fun normalizeTag(raw: String): String = normalizeSearchToken(raw, MAX_TAG_LENGTH)

    private fun normalizeSearchToken(
        raw: String,
        maxLength: Int,
    ): String =
        raw
            .trim()
            .replace(WHITESPACE_REGEX, " ")
            .take(maxLength)

    companion object {
        private const val MAX_KEYWORD_LENGTH = 80
        private const val MAX_TAG_LENGTH = 40
        private val WHITESPACE_REGEX = Regex("\\s+")
        private val HASHTAG_REGEX = Regex("(^|\\s)#([\\p{L}\\p{N}_-]{1,40})")
        private val PREFIXED_TAG_REGEX = Regex("^(?:tag|태그)\\s*:\\s*([\\p{L}\\p{N}_-]{1,40})$", RegexOption.IGNORE_CASE)
    }
}
