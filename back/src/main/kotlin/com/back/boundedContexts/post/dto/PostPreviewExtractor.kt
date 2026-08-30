package com.back.boundedContexts.post.dto

object PostPreviewExtractor {
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
        val metadata = parsePreviewMetadata(content)
        return metadata.thumbnail ?: markdownImageRegex.find(metadata.body)?.groupValues?.getOrNull(1)
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
