package com.back.boundedContexts.post.dto

import com.back.global.util.StripedDigestLruCache
import com.back.global.util.Utf8ChunkDigest

/**
 * 마크다운 frontmatter/상단 메타 라인에서 tags/categories를 추출한다.
 *
 * Reference implementation note: 16-stripe LRU cache partitioning (`digestHead and 15`,
 * inspired by Apache-2.0 Guava Striped / Caffeine segments) with collision-safe 128-bit
 * digest keys from [Utf8ChunkDigest.sha256Digest128] to eliminate lock contention and
 * per-lookup hex string allocations.
 */
object PostMetaExtractor {
    internal const val MAX_CACHE_ENTRIES = 512

    data class PostMeta(
        val tags: List<String>,
        val categories: List<String>,
    )

    private val EMPTY_META =
        PostMeta(
            tags = emptyList(),
            categories = emptyList(),
        )

    private val metaCache = StripedDigestLruCache<PostMeta>(MAX_CACHE_ENTRIES)

    private val metadataLineRegex =
        Regex(
            "^\\s*(tag|tags|category|categories|summary|thumbnail|thumb|cover|coverimage|cover_image)\\s*:\\s*(.+)\\s*$",
            RegexOption.IGNORE_CASE,
        )

    fun extract(content: String): PostMeta {
        val metadataBlock = extractMetadataBlock(content) ?: return EMPTY_META
        val digestKey = Utf8ChunkDigest.sha256Digest128(metadataBlock)
        metaCache.get(digestKey)?.let { return it }
        val computed = buildMeta(metadataBlock)
        metaCache.put(digestKey, computed)
        return computed
    }

    internal fun clearCache() {
        metaCache.clear()
    }

    internal fun cachedEntryCount(): Int = metaCache.totalSize()

    internal fun stripeCount(): Int = metaCache.stripeCount()

    internal fun stripeEntryCounts(): IntArray = metaCache.stripeSizes()

    internal fun cacheKeyFor(metadataBlock: String): String = Utf8ChunkDigest.sha256Hex(metadataBlock)

    private fun extractMetadataBlock(content: String): String? {
        var cursor = skipLeadingWhitespace(content, 0)
        if (cursor >= content.length) return null

        var frontmatterBlock: String? = null
        val frontmatterBodyStart = openingFrontmatterBodyOffset(content, cursor)
        if (frontmatterBodyStart != -1) {
            val closingIndex = content.indexOf("\n---", startIndex = frontmatterBodyStart)
            if (closingIndex > 0) {
                frontmatterBlock = content.substring(frontmatterBodyStart, closingIndex)
                cursor = skipLeadingWhitespace(content, closingIndex + 4)
            }
        }

        var blockStart = -1
        var blockEnd = -1
        while (cursor < content.length) {
            val newlineIndex = content.indexOf('\n', startIndex = cursor)
            val lineEnd = if (newlineIndex == -1) content.length else newlineIndex
            val colonIndex = content.indexOf(':', startIndex = cursor)
            if (colonIndex !in cursor until lineEnd) break
            if (!metadataLineRegex.matches(content.subSequence(cursor, lineEnd))) break
            if (blockStart == -1) {
                blockStart = cursor
            }
            blockEnd = lineEnd
            cursor = lineEnd + 1
        }

        if (blockStart == -1) return frontmatterBlock
        val headerBlock = content.substring(blockStart, blockEnd)
        return if (frontmatterBlock == null) headerBlock else "$frontmatterBlock\n$headerBlock"
    }

    private fun openingFrontmatterBodyOffset(
        content: String,
        cursor: Int,
    ): Int =
        when {
            content.startsWith("---\n", startIndex = cursor) -> cursor + 4
            content.startsWith("---\r\n", startIndex = cursor) -> cursor + 5
            else -> -1
        }

    private fun skipLeadingWhitespace(
        text: String,
        startIndex: Int,
    ): Int {
        var index = startIndex
        while (index < text.length && text[index].isWhitespace()) {
            index += 1
        }
        return index
    }

    private fun buildMeta(metadataBlock: String): PostMeta {
        val tags = linkedSetOf<String>()
        val categories = linkedSetOf<String>()

        metadataBlock.lineSequence().forEach { line ->
            val colonIndex = line.indexOf(':')
            if (colonIndex > 0) {
                val key = line.substring(0, colonIndex).trim().lowercase()
                val rawValue = line.substring(colonIndex + 1)
                if (key == "tag" || key == "tags") {
                    collectMetaItems(rawValue, tags)
                } else if (key == "category" || key == "categories") {
                    collectMetaItems(rawValue, categories)
                }
            }
        }

        return PostMeta(
            tags = tags.toList(),
            categories = categories.toList(),
        )
    }

    private fun collectMetaItems(
        rawValue: String,
        sink: MutableCollection<String>,
    ) {
        val stripped =
            rawValue
                .trim()
                .removePrefix("[")
                .removeSuffix("]")
        var start = 0
        while (start <= stripped.length) {
            val commaIndex = stripped.indexOf(',', startIndex = start)
            val end = if (commaIndex == -1) stripped.length else commaIndex
            val token =
                stripped
                    .substring(start, end)
                    .trim()
                    .removeSurrounding("\"")
                    .removeSurrounding("'")
                    .trim()
            if (token.isNotEmpty()) {
                sink.add(token)
            }
            if (commaIndex == -1) break
            start = commaIndex + 1
        }
    }
}
