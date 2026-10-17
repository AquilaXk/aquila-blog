package com.back.boundedContexts.post.application.support

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.HexFormat

/**
 * PostCacheTags는 공개 읽기 캐시 태그를 한 곳에서 정의해
 * 응답 헤더(surrogate/cache-tag)와 CDN purge 키 드리프트를 방지합니다.
 */
object PostCacheTags {
    const val LIST = "post-list"
    const val FEED = "post-feed"
    const val FEED_CURSOR = "post-feed-cursor"
    const val EXPLORE = "post-explore"
    const val EXPLORE_CURSOR = "post-explore-cursor"
    const val SEARCH = "post-search"
    const val TAGS = "post-tags"
    const val DETAIL = "post-detail"

    private val NON_TAG_CHAR_REGEX = Regex("[^a-z0-9_-]")
    private val MULTI_DASH_REGEX = Regex("-+")

    fun byPostId(postId: Long): String = "post-id-$postId"

    fun byTag(tag: String): String {
        val canonical = tag.trim().lowercase()
        if (canonical.isBlank()) return "post-tag-empty"

        val slug =
            canonical
                .replace(NON_TAG_CHAR_REGEX, "-")
                .replace(MULTI_DASH_REGEX, "-")
                .trim('-')
                .take(MAX_TAG_SLUG_LENGTH)
        val fingerprint = shortHash(canonical)
        val token =
            if (slug.isBlank()) {
                "post-tag-$fingerprint"
            } else {
                "post-tag-$slug-$fingerprint"
            }

        return token.take(MAX_TAG_LENGTH)
    }

    fun writeInvalidationTags(
        postId: Long,
        beforeTags: Collection<String> = emptyList(),
        afterTags: Collection<String> = emptyList(),
    ): Set<String> =
        buildSet {
            add(LIST)
            add(FEED)
            add(FEED_CURSOR)
            add(EXPLORE)
            add(EXPLORE_CURSOR)
            add(SEARCH)
            add(TAGS)
            add(DETAIL)
            add(byPostId(postId))
            beforeTags.mapTo(this) { byTag(it) }
            afterTags.mapTo(this) { byTag(it) }
        }

    private fun shortHash(input: String): String {
        val digest =
            MessageDigest
                .getInstance("SHA-256")
                .digest(input.toByteArray(StandardCharsets.UTF_8))
        return HexFormat.of().formatHex(digest, 0, TAG_HASH_BYTES)
    }

    private const val MAX_TAG_LENGTH = 64
    private const val MAX_TAG_SLUG_LENGTH = 40
    private const val TAG_HASH_BYTES = 6
}
