package com.back.boundedContexts.post.dto

import com.back.global.util.StripedDigestLruCache
import com.back.global.util.Utf8ChunkDigest
import com.back.global.util.Utf8ChunkDigest.Digest128

/**
 * 마크다운 본문/메타데이터에서 썸네일 이미지 URL을 추출한다.
 *
 * 참조 구현: FasterXML/jackson-core (Apache-2.0) & commonmark/commonmark-java (BSD-2-Clause)
 * 16-stripe LRU cache partitioning (`digestHead and 15`, inspired by Apache-2.0 Guava Striped / Caffeine segments)
 * with collision-safe 128-bit digest keys from [Utf8ChunkDigest.sha256Digest128] to reduce lock contention.
 * 정적 128-엔트리 ASCII 비트마스크 문자 분류 테이블을 통한 단일 패스 줄 경계 탐색으로 임시 문자열 할당을 최소화한다.
 */
object PostPreviewExtractor {
    internal const val MAX_CACHE_ENTRIES = 256
    internal const val MAX_SCAN_CHARS = 65_536
    private const val MAX_IMAGE_TOKEN_SCAN_CHARS = 512
    private const val NO_THUMBNAIL_SENTINEL = "__NO_THUMBNAIL__"

    private const val FLAG_WS: Byte = 1
    private const val FLAG_EOL: Byte = 2

    private val ASCII_CHARS =
        ByteArray(128).apply {
            this['\n'.code] = (this['\n'.code].toInt() or FLAG_EOL.toInt() or FLAG_WS.toInt()).toByte()
            this['\r'.code] = (this['\r'.code].toInt() or FLAG_EOL.toInt() or FLAG_WS.toInt()).toByte()
            this[' '.code] = (this[' '.code].toInt() or FLAG_WS.toInt()).toByte()
            this['\t'.code] = (this['\t'.code].toInt() or FLAG_WS.toInt()).toByte()
            this[11] = (this[11].toInt() or FLAG_WS.toInt()).toByte()
            this[12] = (this[12].toInt() or FLAG_WS.toInt()).toByte()
        }

    private val thumbnailCache = StripedDigestLruCache<String>(MAX_CACHE_ENTRIES)

    private class HeaderScanResult(
        val explicitThumbnail: String?,
        val bodyStartOffset: Int,
    )

    fun extractThumbnail(content: String): String? {
        val digestKey = computeDigestKey(content)
        val cached = thumbnailCache.get(digestKey)
        if (cached != null) {
            return if (cached == NO_THUMBNAIL_SENTINEL) null else cached
        }
        val result = computeThumbnail(content)
        thumbnailCache.put(digestKey, result ?: NO_THUMBNAIL_SENTINEL)
        return result
    }

    internal fun computeDigestKey(content: String): Digest128 {
        val scanLen = minOf(content.length, MAX_SCAN_CHARS)
        val base = Utf8ChunkDigest.sha256Digest128Range(content, 0, scanLen)
        if (content.length <= MAX_SCAN_CHARS) {
            return base
        }
        val totalLength = content.length.toLong()
        val foldedHigh = base.highBits xor (totalLength shl 32 or (totalLength ushr 32))
        val foldedLow = base.lowBits xor (totalLength * -7046029254386353131L)
        return Digest128(foldedHigh, foldedLow)
    }

    private fun computeThumbnail(content: String): String? {
        val scanLimit = minOf(content.length, MAX_SCAN_CHARS)
        val scanResult = extractFrontmatterAndMetadataHeader(content, scanLimit)
        return scanResult.explicitThumbnail ?: findFirstBodyMarkdownImage(content, scanResult.bodyStartOffset, scanLimit)
    }

    /**
     * Single-pass O(N) markdown image scanner bounded to a single line, 512 chars per token,
     * and MAX_SCAN_CHARS scan window, eliminating catastrophic regex backtracking on malformed `![...` sequences.
     */
    private fun findFirstBodyMarkdownImage(
        content: String,
        bodyStartOffset: Int,
        scanLimit: Int,
    ): String? {
        var cursor = bodyStartOffset
        while (cursor < scanLimit) {
            val marker = content.indexOf("![", startIndex = cursor)
            if (marker < 0 || marker >= scanLimit) return null

            val lineEnd = findLineEnd(content, marker + 2, scanLimit)

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
                        minOf(scanLimit, lineEnd + 1)
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
                if (ch == ')' || isWhitespace(ch)) break
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

    private fun findLineEnd(
        content: String,
        start: Int,
        limit: Int,
    ): Int {
        var idx = start
        while (idx < limit) {
            val c = content[idx].code
            if (c < 128 && (ASCII_CHARS[c].toInt() and FLAG_EOL.toInt()) != 0) {
                return idx
            }
            idx++
        }
        return limit
    }

    private fun isWhitespace(ch: Char): Boolean {
        val code = ch.code
        return if (code < 128) {
            (ASCII_CHARS[code].toInt() and FLAG_WS.toInt()) != 0
        } else {
            ch.isWhitespace()
        }
    }

    private fun hasValidOptionalTitleBeforeClosingParen(
        content: String,
        afterUrlIndex: Int,
        limit: Int,
    ): Boolean {
        var idx = afterUrlIndex
        if (idx >= limit || !isWhitespace(content[idx])) return false
        while (idx < limit && isWhitespace(content[idx])) idx++
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

    private fun extractFrontmatterAndMetadataHeader(
        content: String,
        scanLimit: Int,
    ): HeaderScanResult {
        var cursor = skipLeadingWhitespace(content, 0, scanLimit)
        if (cursor >= scanLimit) return HeaderScanResult(null, scanLimit)

        var thumbnail: String? = null
        val frontmatterBodyStart = openingFrontmatterBodyOffset(content, cursor, scanLimit)
        if (frontmatterBodyStart != -1) {
            val closingIndex = content.indexOf("\n---", startIndex = frontmatterBodyStart)
            if (closingIndex in 1 until scanLimit) {
                var lineStart = frontmatterBodyStart
                while (lineStart < closingIndex) {
                    val lineEnd = findLineEnd(content, lineStart, closingIndex)
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
                    lineStart =
                        if (lineEnd < closingIndex &&
                            content[lineEnd] == '\r' &&
                            lineEnd + 1 < closingIndex &&
                            content[lineEnd + 1] == '\n'
                        ) {
                            lineEnd + 2
                        } else {
                            lineEnd + 1
                        }
                }
                cursor = skipLeadingWhitespace(content, closingIndex + 4, scanLimit)
            }
        }

        if (thumbnail != null) {
            return HeaderScanResult(
                explicitThumbnail = thumbnail,
                bodyStartOffset = cursor,
            )
        }

        while (cursor < scanLimit) {
            val lineEnd = findLineEnd(content, cursor, scanLimit)
            val colonIndex = content.indexOf(':', startIndex = cursor)
            if (colonIndex !in cursor until lineEnd) break
            val kind = PostHeaderMetadataMatcher.matchLine(content, cursor, lineEnd, colonIndex)
            if (kind == PostHeaderMetadataMatcher.KIND_NONE) break
            if (kind == PostHeaderMetadataMatcher.KIND_THUMBNAIL) {
                PostHeaderMetadataMatcher.unquoteTrimmed(content, colonIndex + 1, lineEnd)?.let {
                    thumbnail = it
                }
            }
            cursor =
                if (lineEnd < scanLimit && content[lineEnd] == '\r' && lineEnd + 1 < scanLimit && content[lineEnd + 1] == '\n') {
                    lineEnd + 2
                } else if (lineEnd < scanLimit) {
                    lineEnd + 1
                } else {
                    scanLimit
                }
        }

        return HeaderScanResult(
            explicitThumbnail = thumbnail,
            bodyStartOffset = skipLeadingWhitespace(content, cursor, scanLimit),
        )
    }

    private fun openingFrontmatterBodyOffset(
        content: String,
        cursor: Int,
        scanLimit: Int,
    ): Int {
        if (cursor + 4 <= scanLimit && content.startsWith("---\n", startIndex = cursor)) return cursor + 4
        if (cursor + 5 <= scanLimit && content.startsWith("---\r\n", startIndex = cursor)) return cursor + 5
        return -1
    }

    private fun skipLeadingWhitespace(
        text: String,
        startIndex: Int,
        limit: Int,
    ): Int {
        var index = startIndex
        while (index < limit && isWhitespace(text[index])) {
            index += 1
        }
        return index
    }
}
