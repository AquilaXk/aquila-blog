package com.back.boundedContexts.post.dto

object PostPreviewExtractor {
    private const val SUMMARY_MAX_LENGTH = 180
    private const val CACHE_MAX_ENTRIES = 1024

    private val markdownImageRegex = Regex("!\\[[^\\]]*\\]\\(([^)\\s]+)(?:\\s+\"[^\"]*\")?\\)")
    private val markdownLinkRegex = Regex("\\[(.*?)\\]\\((.*?)\\)")
    private val fencedCodeRegex = Regex("```[\\s\\S]*?```")
    private val inlineCodeRegex = Regex("`([^`]+)`")
    private val markdownPunctuationRegex = Regex("[#>*_~-]")
    private val whitespaceRegex = Regex("\\s+")

    data class Preview(
        val thumbnail: String?,
        val summary: String,
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
        val thumbnail = markdownImageRegex.find(content)?.groupValues?.getOrNull(1)
        val normalized =
            content
                .replace(fencedCodeRegex, " ")
                .replace(markdownImageRegex, " ")
                .replace(inlineCodeRegex, "$1")
                .replace(markdownLinkRegex, "$1")
                .replace(markdownPunctuationRegex, " ")
                .replace(whitespaceRegex, " ")
                .trim()

        val summary =
            if (normalized.length <= SUMMARY_MAX_LENGTH) {
                normalized
            } else {
                "${normalized.take(SUMMARY_MAX_LENGTH).trim()}..."
            }

        return Preview(
            thumbnail = thumbnail,
            summary = summary,
        )
    }

    private fun contentKey(content: String): Long = (content.hashCode().toLong() shl 32) xor content.length.toLong()
}
