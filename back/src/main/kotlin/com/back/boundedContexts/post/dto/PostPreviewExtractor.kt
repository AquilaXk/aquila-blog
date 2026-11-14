package com.back.boundedContexts.post.dto

import com.back.global.util.StripedDigestLruCache
import com.back.global.util.Utf8ChunkDigest

/**
 * 마크다운 본문/메타데이터에서 썸네일 이미지 URL을 추출한다.
 *
 * Reference implementation note: 16-stripe LRU cache partitioning (`digestHead and 15`,
 * inspired by Apache-2.0 Guava Striped / Caffeine segments) with collision-safe 128-bit
 * digest keys from [Utf8ChunkDigest.sha256Digest128] to reduce lock contention and
 * eliminate per-lookup hex string allocations.
 */
object PostPreviewExtractor {
    internal const val MAX_CACHE_ENTRIES = 256
    private const val MAX_CACHEABLE_CONTENT_CHARS = 16_384
    private const val MAX_IMAGE_TOKEN_SCAN_CHARS = 512
    private const val NO_THUMBNAIL_SENTINEL = "__NO_THUMBNAIL__"

    private val thumbnailCache = StripedDigestLruCache<String>(MAX_CACHE_ENTRIES)

    private class HeaderScanResult(
        val explicitThumbnail: String?,
        val bodyStartOffset: Int,
    )

    fun extractThumbnail(content: String): String? {
        if (content.length > MAX_CACHEABLE_CONTENT_CHARS) {
            return computeThumbnail(content)
        }
        val digestKey = Utf8ChunkDigest.sha256Digest128(content)
        val cached = thumbnailCache.get(digestKey)
        if (cached != null) {
            return if (cached == NO_THUMBNAIL_SENTINEL) null else cached
        }
        val result = computeThumbnail(content)
        thumbnailCache.put(digestKey, result ?: NO_THUMBNAIL_SENTINEL)
        return result
    }

    private fun computeThumbnail(content: String): String? {
        val scanResult = extractFrontmatterAndMetadataHeader(content)
        return scanResult.explicitThumbnail ?: findFirstBodyMarkdownImage(content, scanResult.bodyStartOffset)
    }

    /**
     * Single-pass O(N) markdown image scanner bounded to a single line and 512 chars per token,
     * eliminating catastrophic regex backtracking on malformed `![...` sequences.
     */
    private fun findFirstBodyMarkdownImage(
        content: String,
        bodyStartOffset: Int,
    ): String? {
        val len = content.length
        var cursor = bodyStartOffset
        while (cursor < len) {
            val marker = content.indexOf("![", startIndex = cursor)
            if (marker < 0) return null

            var lineEnd = content.indexOf('\n', startIndex = marker + 2)
            if (lineEnd < 0) lineEnd = len
            val crIndex = content.indexOf('\r', startIndex = marker + 2)
            if (crIndex in (marker + 2) until lineEnd) lineEnd = crIndex

            val altSearchEnd = minOf(lineEnd, marker + 2 + MAX_IMAGE_TOKEN_SCAN_CHARS)
            var closeBracket = -1
            var i = marker + 2
            while (i < altSearchEnd) {
                if (content[i] == ']') {
                    closeBracket = i
                    break
                }
                i++
            }

            if (closeBracket < 0) {
                val nextBracketOnLine = content.indexOf(']', startIndex = altSearchEnd)
                cursor =
                    if (nextBracketOnLine < 0 || nextBracketOnLine >= lineEnd) {
                        minOf(len, lineEnd + 1)
                    } else {
                        maxOf(marker + 2, nextBracketOnLine - MAX_IMAGE_TOKEN_SCAN_CHARS)
                    }
                continue
            }

            if (closeBracket + 1 >= lineEnd || content[closeBracket + 1] != '(') {
                cursor = closeBracket + 1
                continue
            }

            val urlStart = closeBracket + 2
            if (urlStart >= lineEnd) {
                cursor = lineEnd + 1
                continue
            }

            val urlScanLimit = minOf(lineEnd, urlStart + MAX_IMAGE_TOKEN_SCAN_CHARS)
            var urlEnd = urlStart
            while (urlEnd < urlScanLimit) {
                val ch = content[urlEnd]
                if (ch == ')' || ch.isWhitespace()) break
                urlEnd++
            }
            if (urlEnd == urlStart) {
                cursor = urlStart + 1
                continue
            }

            val validClosingParen =
                if (urlEnd < urlScanLimit && content[urlEnd] == ')') {
                    true
                } else {
                    hasValidOptionalTitleBeforeClosingParen(content, urlEnd, minOf(lineEnd, urlStart + MAX_IMAGE_TOKEN_SCAN_CHARS))
                }
            if (validClosingParen) {
                return content.substring(urlStart, urlEnd)
            }
            cursor = urlEnd + 1
        }
        return null
    }

    private fun hasValidOptionalTitleBeforeClosingParen(
        content: String,
        afterUrlIndex: Int,
        limit: Int,
    ): Boolean {
        var idx = afterUrlIndex
        if (idx >= limit || !content[idx].isWhitespace()) return false
        while (idx < limit && content[idx].isWhitespace()) idx++
        if (idx >= limit || content[idx] != '"') return false
        idx++
        while (idx < limit && content[idx] != '"') idx++
        if (idx >= limit) return false
        idx++
        return idx < limit && content[idx] == ')'
    }

    internal fun clearCache() {
        thumbnailCache.clear()
    }

    internal fun cachedEntryCount(): Int = thumbnailCache.totalSize()

    internal fun stripeCount(): Int = thumbnailCache.stripeCount()

    internal fun stripeEntryCounts(): IntArray = thumbnailCache.stripeSizes()

    internal fun cacheKeyFor(content: String): String = Utf8ChunkDigest.sha256Hex(content)

    private fun extractFrontmatterAndMetadataHeader(content: String): HeaderScanResult {
        var cursor = skipLeadingWhitespace(content, 0)
        if (cursor >= content.length) return HeaderScanResult(null, content.length)

        var thumbnail: String? = null
        val frontmatterBodyStart = openingFrontmatterBodyOffset(content, cursor)
        if (frontmatterBodyStart != -1) {
            val closingIndex = content.indexOf("\n---", startIndex = frontmatterBodyStart)
            if (closingIndex > 0) {
                var lineStart = frontmatterBodyStart
                while (lineStart < closingIndex) {
                    val nextNewline = content.indexOf('\n', startIndex = lineStart)
                    val lineEnd = if (nextNewline == -1 || nextNewline > closingIndex) closingIndex else nextNewline
                    val colonIndex = content.indexOf(':', startIndex = lineStart)
                    if (
                        colonIndex > lineStart &&
                        colonIndex < lineEnd &&
                        PostHeaderMetadataMatcher.matchKeyKind(content, lineStart, colonIndex) ==
                        PostHeaderMetadataMatcher.KIND_THUMBNAIL
                    ) {
                        PostHeaderMetadataMatcher.unquoteTrimmed(content, colonIndex + 1, lineEnd)?.let {
                            thumbnail = it
                        }
                    }
                    lineStart = lineEnd + 1
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
            val colonIndex = content.indexOf(':', startIndex = cursor)
            if (colonIndex !in cursor until lineEnd) break
            val kind = PostHeaderMetadataMatcher.matchLine(content, cursor, lineEnd, colonIndex)
            if (kind == PostHeaderMetadataMatcher.KIND_NONE) break
            if (kind == PostHeaderMetadataMatcher.KIND_THUMBNAIL) {
                PostHeaderMetadataMatcher.unquoteTrimmed(content, colonIndex + 1, lineEnd)?.let {
                    thumbnail = it
                }
            }
            cursor = if (nextNewline == -1) content.length else nextNewline + 1
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
}
