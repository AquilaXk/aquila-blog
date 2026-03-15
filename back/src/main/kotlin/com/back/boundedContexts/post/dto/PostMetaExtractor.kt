package com.back.boundedContexts.post.dto

object PostMetaExtractor {
    data class PostMeta(
        val tags: List<String>,
        val categories: List<String>,
    )

    private val metadataLineRegex =
        Regex(
            "^\\s*(tag|tags|category|categories|summary|thumbnail|thumb|cover|coverimage|cover_image)\\s*:\\s*(.+)\\s*$",
            RegexOption.IGNORE_CASE,
        )

    fun extract(content: String): PostMeta {
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

        var consumed = 0
        for (line in remaining.lineSequence()) {
            if (line.isBlank()) {
                consumed += 1
                break
            }

            val match = metadataLineRegex.matchEntire(line) ?: break
            val key = match.groupValues[1].lowercase()
            val rawValue = match.groupValues[2]

            when (key) {
                "tag", "tags" -> appendTags(parseMetaItems(rawValue))
                "category", "categories" -> appendCategories(parseMetaItems(rawValue))
            }
            consumed += 1
        }

        return PostMeta(
            tags = tags.toList(),
            categories = categories.toList(),
        )
    }

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
