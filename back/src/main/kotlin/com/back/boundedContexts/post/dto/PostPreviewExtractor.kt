package com.back.boundedContexts.post.dto

object PostPreviewExtractor {
    private const val MAX_CACHE_SIZE = 256
    private const val NO_THUMBNAIL_SENTINEL = "__NO_THUMBNAIL__"

    private val thumbnailCache =
        java.util.Collections.synchronizedMap(
            object : java.util.LinkedHashMap<String, String>(MAX_CACHE_SIZE, 0.75f, true) {
                override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?): Boolean = size > MAX_CACHE_SIZE
            },
        )

    private val markdownImageRegex = Regex("!\\[[^\\]]*\\]\\(([^)\\s]+)(?:\\s+\"[^\"]*\")?\\)")
    private val metadataLineRegex =
        Regex(
            "^\\s*(tag|tags|category|categories|summary|thumbnail|thumb|cover|coverimage|cover_image)\\s*:\\s*(.+)\\s*$",
            RegexOption.IGNORE_CASE,
        )

    private data class PreviewMetadata(
        val body: String,
        val thumbnail: String?,
    )

    fun extractThumbnail(content: String): String? {
        val cached = thumbnailCache[content]
        if (cached != null) {
            return if (cached == NO_THUMBNAIL_SENTINEL) null else cached
        }
        val metadata = parsePreviewMetadata(content)
        val result = metadata.thumbnail ?: markdownImageRegex.find(metadata.body)?.groupValues?.getOrNull(1)
        thumbnailCache[content] = result ?: NO_THUMBNAIL_SENTINEL
        return result
    }

    private fun parsePreviewMetadata(content: String): PreviewMetadata {
        var remaining = content.trimStart()
        var thumbnail: String? = null

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
        )
    }
}
