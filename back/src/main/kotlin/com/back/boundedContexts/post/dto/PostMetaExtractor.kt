package com.back.boundedContexts.post.dto

/**
 * `PostMetaExtractor` 오브젝트입니다.
 * - 역할: 정적 유틸/상수/팩토리 기능을 제공합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
object PostMetaExtractor {
    private const val CACHE_MAX_ENTRIES = 1024

    /**
     * PostMeta는 계층 간 데이터 전달에 사용하는 DTO입니다.
     * 도메인 엔티티 직접 노출을 피하고 API/서비스 경계를 명확히 유지합니다.
     */
    data class PostMeta(
        val tags: List<String>,
        val categories: List<String>,
    )

    private val metaCache =
        object : LinkedHashMap<Long, PostMeta>(CACHE_MAX_ENTRIES, 0.75f, true) {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Long, PostMeta>): Boolean = size > CACHE_MAX_ENTRIES
        }

    private val metadataLineRegex =
        Regex(
            "^\\s*(tag|tags|category|categories|summary|thumbnail|thumb|cover|coverimage|cover_image)\\s*:\\s*(.+)\\s*$",
            RegexOption.IGNORE_CASE,
        )

    fun extract(content: String): PostMeta =
        synchronized(metaCache) {
            val key = contentKey(content)
            metaCache[key] ?: buildMeta(content).also { metaCache[key] = it }
        }

    private fun buildMeta(content: String): PostMeta {
        var remaining = content.trimStart()
        val tags = linkedSetOf<String>()
        val categories = linkedSetOf<String>()

        fun appendTags(items: List<String>) {
            items.forEach { item ->
                val normalized = item.trim()
                if (normalized.isNotEmpty()) tags += normalized
            }
        }

        fun appendCategories(items: List<String>) {
            items.forEach { item ->
                val normalized = item.trim()
                if (normalized.isNotEmpty()) categories += normalized
            }
        }

        if (remaining.startsWith("---\n")) {
            val closingIndex = remaining.indexOf("\n---", startIndex = 4)
            if (closingIndex > 0) {
                remaining
                    .substring(4, closingIndex)
                    .lineSequence()
                    .forEach { line ->
                        val parts = line.split(":", limit = 2)
                        if (parts.size < 2) return@forEach
                        val key = parts[0].trim().lowercase()
                        val rawValue = parts[1].trim()
                        if (rawValue.isBlank()) return@forEach

                        when (key) {
                            "tag", "tags" -> appendTags(parseMetaItems(rawValue))
                            "category", "categories" -> appendCategories(parseMetaItems(rawValue))
                        }
                    }
                remaining = remaining.substring(closingIndex + 4).trimStart()
            }
        }

        for (line in remaining.lineSequence()) {
            if (line.isBlank()) {
                break
            }

            val match = metadataLineRegex.matchEntire(line) ?: break
            val key = match.groupValues[1].lowercase()
            val rawValue = match.groupValues[2]

            when (key) {
                "tag", "tags" -> appendTags(parseMetaItems(rawValue))
                "category", "categories" -> appendCategories(parseMetaItems(rawValue))
            }
        }

        return PostMeta(
            tags = tags.toList(),
            categories = categories.toList(),
        )
    }

    private fun contentKey(content: String): Long =
        (content.hashCode().toLong() shl 32) xor
            content.length.toLong()

    private fun parseMetaItems(rawValue: String): List<String> {
        val normalized = rawValue.trim().removePrefix("[").removeSuffix("]")
        if (normalized.isBlank()) return emptyList()

        return normalized
            .split(",")
            .map { token ->
                val trimmed = token.trim()
                val unquotedDouble = trimmed.removeSurrounding("\"")
                val unquotedSingle = unquotedDouble.removeSurrounding("'")
                unquotedSingle.trim()
            }.filter { it.isNotEmpty() }
    }
}
