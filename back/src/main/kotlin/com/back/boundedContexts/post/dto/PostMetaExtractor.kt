package com.back.boundedContexts.post.dto

import java.util.concurrent.ConcurrentHashMap

object PostMetaExtractor {
    internal const val MAX_CACHE_ENTRIES = 512

    /**
     * PostMeta는 계층 간 데이터 전달에 사용하는 DTO입니다.
     * 도메인 엔티티 직접 노출을 피하고 API/서비스 경계를 명확히 유지합니다.
     */
    data class PostMeta(
        val tags: List<String>,
        val categories: List<String>,
    )

    private val EMPTY_META =
        PostMeta(
            tags = emptyList(),
            categories = emptyList(),
        )

    private val metaCache = ConcurrentHashMap<String, PostMeta>()

    private val metadataLineRegex =
        Regex(
            "^\\s*(tag|tags|category|categories|summary|thumbnail|thumb|cover|coverimage|cover_image)\\s*:\\s*(.+)\\s*$",
            RegexOption.IGNORE_CASE,
        )

    fun extract(content: String): PostMeta {
        val metadataBlock = extractMetadataBlock(content) ?: return EMPTY_META
        metaCache[metadataBlock]?.let { return it }
        val computed = buildMeta(metadataBlock)
        if (metaCache.size >= MAX_CACHE_ENTRIES) {
            metaCache.keys.firstOrNull()?.let(metaCache::remove)
        }
        metaCache[metadataBlock] = computed
        return computed
    }

    internal fun clearCache() {
        metaCache.clear()
    }

    internal fun cachedEntryCount(): Int = metaCache.size

    private fun extractMetadataBlock(content: String): String? {
        var cursor = skipLeadingWhitespace(content, 0)
        if (cursor >= content.length) return null

        val blocks = ArrayList<String>(2)
        if (content.startsWith("---\n", startIndex = cursor)) {
            val closingIndex = content.indexOf("\n---", startIndex = cursor + 4)
            if (closingIndex > 0) {
                blocks.add(content.substring(cursor + 4, closingIndex))
                cursor = skipLeadingWhitespace(content, closingIndex + 4)
            }
        }

        while (cursor < content.length) {
            val newlineIndex = content.indexOf('\n', startIndex = cursor)
            val lineEnd = if (newlineIndex == -1) content.length else newlineIndex
            val line = content.substring(cursor, lineEnd)
            if (!metadataLineRegex.matches(line)) break
            blocks.add(line)
            cursor = lineEnd + 1
        }

        return if (blocks.isEmpty()) null else blocks.joinToString("\n")
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
            val parts = line.split(":", limit = 2)
            if (parts.size == 2) {
                val key = parts[0].trim().lowercase()
                val items = parseMetaItems(parts[1])
                when (key) {
                    "tag", "tags" -> tags.addAll(items)
                    "category", "categories" -> categories.addAll(items)
                }
            }
        }

        return PostMeta(
            tags = tags.toList(),
            categories = categories.toList(),
        )
    }

    private fun parseMetaItems(rawValue: String): List<String> =
        rawValue
            .trim()
            .removePrefix("[")
            .removeSuffix("]")
            .split(",")
            .map { token ->
                token
                    .trim()
                    .removeSurrounding("\"")
                    .removeSurrounding("'")
                    .trim()
            }.filter { it.isNotEmpty() }
}
