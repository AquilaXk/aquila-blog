package com.back.boundedContexts.post.dto

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.HexFormat
import java.util.concurrent.ConcurrentHashMap

object PostPreviewExtractor {
    internal const val MAX_CACHE_ENTRIES = 256
    private const val NO_THUMBNAIL_SENTINEL = "__NO_THUMBNAIL__"
    private val HEX_FORMAT = HexFormat.of()

    private val thumbnailCache = ConcurrentHashMap<String, String>()

    private val markdownImageRegex = Regex("!\\[[^\\]]*\\]\\(([^)\\s]+)(?:\\s+\"[^\"]*\")?\\)")
    private val metadataLineRegex =
        Regex(
            "^\\s*(tag|tags|category|categories|summary|thumbnail|thumb|cover|coverimage|cover_image)\\s*:\\s*(.+)\\s*$",
            RegexOption.IGNORE_CASE,
        )
    private val THUMBNAIL_KEYS = setOf("thumbnail", "thumb", "cover", "coverimage", "cover_image")

    private class HeaderScanResult(
        val explicitThumbnail: String?,
        val bodyStartOffset: Int,
    )

    fun extractThumbnail(content: String): String? {
        val cacheKey = cacheKeyFor(content)
        val cached = thumbnailCache[cacheKey]
        if (cached != null) {
            return if (cached == NO_THUMBNAIL_SENTINEL) null else cached
        }
        val scanResult = extractFrontmatterAndMetadataHeader(content)
        val result =
            scanResult.explicitThumbnail
                ?: markdownImageRegex.find(content, startIndex = scanResult.bodyStartOffset)?.groupValues?.getOrNull(1)
        thumbnailCache[cacheKey] = result ?: NO_THUMBNAIL_SENTINEL
        while (thumbnailCache.size > MAX_CACHE_ENTRIES) {
            thumbnailCache.remove(thumbnailCache.keys.iterator().next())
        }
        return result
    }

    internal fun clearCache() {
        thumbnailCache.clear()
    }

    internal fun cachedEntryCount(): Int = thumbnailCache.size

    internal fun cacheKeyFor(content: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(content.toByteArray(StandardCharsets.UTF_8))
        return HEX_FORMAT.formatHex(digest)
    }

    private fun extractFrontmatterAndMetadataHeader(content: String): HeaderScanResult {
        var cursor = skipLeadingWhitespace(content, 0)
        if (cursor >= content.length) return HeaderScanResult(null, content.length)

        var thumbnail: String? = null
        val frontmatterBodyStart = openingFrontmatterBodyOffset(content, cursor)
        if (frontmatterBodyStart != -1) {
            val closingIndex = content.indexOf("\n---", startIndex = frontmatterBodyStart)
            if (closingIndex > 0) {
                content
                    .substring(frontmatterBodyStart, closingIndex)
                    .lineSequence()
                    .forEach { line ->
                        val parts = line.split(":", limit = 2)
                        if (parts.size == 2) {
                            extractThumbnailValue(parts[0], parts[1])?.let { thumbnail = it }
                        }
                    }
                cursor = skipLeadingWhitespace(content, closingIndex + 4)
            }
        }

        if (thumbnail != null) {
            return HeaderScanResult(
                explicitThumbnail = thumbnail,
                bodyStartOffset = cursor,
            )
        }

        while (cursor < content.length) {
            val nextNewline = content.indexOf('\n', startIndex = cursor)
            val lineEnd = if (nextNewline == -1) content.length else nextNewline
            val line = content.substring(cursor, lineEnd)
            val match = metadataLineRegex.matchEntire(line) ?: break
            extractThumbnailValue(match.groupValues[1], match.groupValues[2])?.let { thumbnail = it }
            cursor = lineEnd + 1
        }

        return HeaderScanResult(
            explicitThumbnail = thumbnail,
            bodyStartOffset = skipLeadingWhitespace(content, cursor),
        )
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

    private fun extractThumbnailValue(
        rawKey: String,
        rawValue: String,
    ): String? {
        val key = rawKey.trim().lowercase()
        if (key !in THUMBNAIL_KEYS) return null
        val value =
            rawValue
                .trim()
                .removeSurrounding("\"")
                .removeSurrounding("'")
                .trim()
        return value.ifBlank { null }
    }
}
