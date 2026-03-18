package com.back.boundedContexts.post.dto

/**
 * `PostPreviewExtractor` 오브젝트입니다.
 * - 역할: 정적 유틸/상수/팩토리 기능을 제공합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
object PostPreviewExtractor {
    private const val SUMMARY_MAX_LENGTH = 180
    private const val CACHE_MAX_ENTRIES = 1024

    private val markdownImageRegex = Regex("!\\[[^\\]]*\\]\\(([^)\\s]+)(?:\\s+\"[^\"]*\")?\\)")
    private val markdownLinkRegex = Regex("\\[(.*?)\\]\\((.*?)\\)")
    private val fencedCodeRegex = Regex("```[\\s\\S]*?```")
    private val inlineCodeRegex = Regex("`([^`]+)`")
    private val markdownPunctuationRegex = Regex("[#>*_~-]")
    private val whitespaceRegex = Regex("\\s+")
    private val metadataLineRegex =
        Regex(
            "^\\s*(tag|tags|category|categories|summary|thumbnail|thumb|cover|coverimage|cover_image)\\s*:\\s*(.+)\\s*$",
            RegexOption.IGNORE_CASE,
        )

    /**
     * Preview는 계층 간 데이터 전달에 사용하는 DTO입니다.
     * 도메인 엔티티 직접 노출을 피하고 API/서비스 경계를 명확히 유지합니다.
     */
    data class Preview(
        val thumbnail: String?,
        val summary: String,
    )

    /**
     * PreviewMetadata는 계층 간 데이터 전달에 사용하는 DTO입니다.
     * 도메인 엔티티 직접 노출을 피하고 API/서비스 경계를 명확히 유지합니다.
     */
    private data class PreviewMetadata(
        val body: String,
        val thumbnail: String?,
        val summary: String?,
    )

    private val previewCache =
        object : LinkedHashMap<Long, Preview>(CACHE_MAX_ENTRIES, 0.75f, true) {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Long, Preview>): Boolean = size > CACHE_MAX_ENTRIES
        }

    fun extract(content: String): Preview =
        synchronized(previewCache) {
            val key = contentKey(content)
            previewCache[key] ?: buildPreview(content).also { previewCache[key] = it }
        }

    fun extractThumbnail(content: String): String? = extract(content).thumbnail

    fun makeSummary(content: String): String = extract(content).summary

    private fun buildPreview(content: String): Preview {
        val metadata = parsePreviewMetadata(content)
        val thumbnail = metadata.thumbnail ?: markdownImageRegex.find(metadata.body)?.groupValues?.getOrNull(1)
        val normalized =
            metadata.body
                .replace(fencedCodeRegex, " ")
                .replace(markdownImageRegex, " ")
                .replace(inlineCodeRegex, "$1")
                .replace(markdownLinkRegex, "$1")
                .replace(markdownPunctuationRegex, " ")
                .replace(whitespaceRegex, " ")
                .trim()
        val compactRaw = metadata.body.replace(whitespaceRegex, " ").trim()
        val relaxedNormalized =
            compactRaw
                .replace(markdownPunctuationRegex, " ")
                .replace(whitespaceRegex, " ")
                .trim()
        val fallbackSummaryCandidate =
            when {
                normalized.isNotBlank() -> normalized
                relaxedNormalized.isNotBlank() -> relaxedNormalized
                compactRaw.isNotBlank() -> compactRaw
                else -> "요약을 생성할 수 없습니다."
            }

        val summary =
            metadata.summary?.let { truncateSummary(it) }
                ?: truncateSummary(fallbackSummaryCandidate)

        return Preview(
            thumbnail = thumbnail,
            summary = summary,
        )
    }

    private fun parsePreviewMetadata(content: String): PreviewMetadata {
        var remaining = content.trimStart()
        var thumbnail: String? = null
        var summary: String? = null

        fun normalizeScalar(raw: String): String =
            raw
                .trim()
                .removeSurrounding("\"")
                .removeSurrounding("'")
                .trim()

        fun assignScalar(
            rawKey: String,
            rawValue: String,
        ) {
            val key = rawKey.trim().lowercase()
            val value = normalizeScalar(rawValue)
            if (value.isBlank()) return

            when (key) {
                "thumbnail", "thumb", "cover", "coverimage", "cover_image" -> thumbnail = value
                "summary" -> summary = value
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
                        assignScalar(parts[0], parts[1])
                    }
                remaining = remaining.substring(closingIndex + 4).trimStart()
            }
        }

        val lines = remaining.lines()
        var consumed = 0
        for (line in lines) {
            if (line.isBlank()) {
                consumed += 1
                break
            }

            val match = metadataLineRegex.matchEntire(line) ?: break
            assignScalar(match.groupValues[1], match.groupValues[2])
            consumed += 1
        }

        if (consumed > 0) {
            remaining = lines.drop(consumed).joinToString("\n").trimStart()
        }

        return PreviewMetadata(
            body = remaining,
            thumbnail = thumbnail,
            summary = summary,
        )
    }

    private fun truncateSummary(value: String): String =
        if (value.length <= SUMMARY_MAX_LENGTH) {
            value
        } else {
            "${value.take(SUMMARY_MAX_LENGTH).trim()}..."
        }

    private fun contentKey(content: String): Long =
        (content.hashCode().toLong() shl 32) xor
            content.length.toLong()
}
