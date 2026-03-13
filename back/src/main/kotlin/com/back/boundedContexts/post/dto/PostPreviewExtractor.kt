package com.back.boundedContexts.post.dto

object PostPreviewExtractor {
    private const val SUMMARY_MAX_LENGTH = 180

    private val markdownImageRegex = Regex("!\\[[^\\]]*\\]\\(([^)\\s]+)(?:\\s+\"[^\"]*\")?\\)")
    private val markdownLinkRegex = Regex("\\[(.*?)\\]\\((.*?)\\)")
    private val fencedCodeRegex = Regex("```[\\s\\S]*?```")
    private val inlineCodeRegex = Regex("`([^`]+)`")
    private val markdownPunctuationRegex = Regex("[#>*_~-]")
    private val whitespaceRegex = Regex("\\s+")

    fun extractThumbnail(content: String): String? = markdownImageRegex.find(content)?.groupValues?.getOrNull(1)

    fun makeSummary(content: String): String {
        val normalized =
            content
                .replace(fencedCodeRegex, " ")
                .replace(markdownImageRegex, " ")
                .replace(inlineCodeRegex, "$1")
                .replace(markdownLinkRegex, "$1")
                .replace(markdownPunctuationRegex, " ")
                .replace(whitespaceRegex, " ")
                .trim()

        if (normalized.length <= SUMMARY_MAX_LENGTH) return normalized

        return "${normalized.take(SUMMARY_MAX_LENGTH).trim()}..."
    }
}
