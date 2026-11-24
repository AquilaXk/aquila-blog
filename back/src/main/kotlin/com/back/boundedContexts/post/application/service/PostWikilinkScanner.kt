package com.back.boundedContexts.post.application.service

import java.util.Locale

internal object PostWikilinkScanner {
    private const val MAX_SCAN_CHARS = 128 * 1024
    private const val MAX_WIKILINK_BODY_CHARS = 256
    private const val MAX_HOST_LOOKBACK_CHARS = 260

    fun normalizeTargetKey(raw: String): String {
        val len = raw.length
        var start = 0
        while (start < len && raw[start].isWhitespace()) start++
        var end = len
        while (end > start && raw[end - 1].isWhitespace()) end--
        if (start >= end) return ""

        val sb = StringBuilder(end - start)
        var pendingSpace = false
        for (i in start until end) {
            val ch = raw[i]
            if (ch.isWhitespace()) {
                pendingSpace = true
                continue
            }
            if (pendingSpace && sb.isNotEmpty()) {
                sb.append(' ')
            }
            pendingSpace = false
            sb.append(ch.lowercaseChar())
        }
        return sb.toString()
    }

    fun referencesTargetPost(
        markdown: String,
        targetPostId: Long,
        normalizedTargetTitle: String,
    ): Boolean {
        if (markdown.isEmpty() || targetPostId <= 0L) return false
        val limit = minOf(markdown.length, MAX_SCAN_CHARS)
        val targetIdText = targetPostId.toString()
        val hasTitle = normalizedTargetTitle.isNotEmpty()

        var inFence = false
        var fenceChar = '\u0000'
        var fenceLength = 0
        var inlineCodeTicks = 0
        var i = 0

        while (i < limit) {
            val lineStart = i == 0 || markdown[i - 1] == '\n'
            if (lineStart) {
                inlineCodeTicks = 0
                val fenceRun = matchFenceMarker(markdown, i, limit)
                if (fenceRun != null) {
                    if (!inFence) {
                        inFence = true
                        fenceChar = fenceRun.markerChar
                        fenceLength = fenceRun.markerLen
                        i = fenceRun.lineEnd
                        continue
                    } else if (
                        fenceRun.markerChar == fenceChar &&
                        fenceRun.markerLen >= fenceLength &&
                        isTrailingFenceLineBlank(markdown, fenceRun.markerEndOffset, fenceRun.lineEnd)
                    ) {
                        inFence = false
                        i = fenceRun.lineEnd
                        continue
                    }
                }
            }
            if (inFence) {
                i++
                continue
            }

            val ch = markdown[i]
            if (ch == '\\' && i + 1 < limit) {
                i += 2
                continue
            }
            if (ch == '`') {
                var ticks = 1
                while (i + ticks < limit && markdown[i + ticks] == '`') ticks++
                inlineCodeTicks =
                    when {
                        inlineCodeTicks == 0 -> ticks
                        inlineCodeTicks == ticks -> 0
                        else -> inlineCodeTicks
                    }
                i += ticks
                continue
            }
            if (inlineCodeTicks > 0) {
                i++
                continue
            }

            if (ch == '[' && i + 1 < limit && markdown[i + 1] == '[') {
                val close = findWikilinkClose(markdown, i + 2, limit)
                if (close > i + 2) {
                    val baseTarget = extractWikilinkBaseTarget(markdown, i + 2, close)
                    if (baseTarget.isNotEmpty() &&
                        !baseTarget.startsWith("#") &&
                        !baseTarget.startsWith("/") &&
                        !startsWithHttpScheme(baseTarget)
                    ) {
                        val normalized = normalizeTargetKey(baseTarget)
                        if (normalized == targetIdText || (hasTitle && normalized == normalizedTargetTitle)) {
                            return true
                        }
                    }
                    i = close + 2
                    continue
                }
            }

            if (ch == '/' && matchesPostsPathId(markdown, i, limit, targetIdText)) {
                return true
            }
            i++
        }
        return false
    }

    private fun findWikilinkClose(
        text: String,
        bodyStart: Int,
        limit: Int,
    ): Int {
        val searchLimit = minOf(limit, bodyStart + MAX_WIKILINK_BODY_CHARS)
        var i = bodyStart
        while (i + 1 < searchLimit) {
            val ch = text[i]
            if (ch == '\n' || ch == '\r') return -1
            if (ch == '\\') {
                i += 2
                continue
            }
            if (ch == ']' && text[i + 1] == ']') {
                return i
            }
            i++
        }
        return -1
    }

    private fun extractWikilinkBaseTarget(
        text: String,
        start: Int,
        end: Int,
    ): String {
        var cut = end
        for (i in start until end) {
            val ch = text[i]
            if (ch == '|' || ch == '#') {
                cut = i
                break
            }
        }
        return text.substring(start, cut).trim()
    }

    private fun startsWithHttpScheme(value: String): Boolean {
        val lower = value.lowercase(Locale.ROOT)
        return lower.startsWith("http://") || lower.startsWith("https://")
    }

    private fun matchesPostsPathId(
        text: String,
        slashIdx: Int,
        limit: Int,
        targetIdText: String,
    ): Boolean {
        val prefix = "/posts/"
        if (slashIdx + prefix.length + targetIdText.length > limit) return false
        if (slashIdx > 0) {
            val prev = text[slashIdx - 1]
            if (prev.isLetterOrDigit() || prev == '-' || prev == '_' || prev == '.') {
                // Allow URL hosts like `https://example.com/posts/42`, disallow `a/posts/42` or `api/posts/42`
                if (slashIdx < 2 || !isHostBoundaryBefore(text, slashIdx)) return false
            } else if (prev == '/' || prev == ':') {
                return false
            }
        }
        for (k in prefix.indices) {
            if (text[slashIdx + k] != prefix[k]) return false
        }
        val idStart = slashIdx + prefix.length
        for (k in targetIdText.indices) {
            if (text[idStart + k] != targetIdText[k]) return false
        }
        val afterIdx = idStart + targetIdText.length
        if (afterIdx >= limit) return true
        val next = text[afterIdx]
        return next == '#' || next == '?' || next == '/' || next == ')' || next == ']' || next.isWhitespace()
    }

    private fun isHostBoundaryBefore(
        text: String,
        slashIdx: Int,
    ): Boolean {
        val scanBackStart = maxOf(0, slashIdx - MAX_HOST_LOOKBACK_CHARS)
        for (i in slashIdx - 1 downTo scanBackStart) {
            val ch = text[i]
            if (ch.isWhitespace() || ch == '(' || ch == '[' || ch == '<' || ch == '?' || ch == '#') return false
            if (ch == '/') {
                return i >= 2 && text[i - 1] == '/' && text[i - 2] == ':'
            }
        }
        return false
    }

    private data class FenceMarker(
        val markerChar: Char,
        val markerLen: Int,
        val markerEndOffset: Int,
        val lineEnd: Int,
    )

    private fun matchFenceMarker(
        text: String,
        lineStart: Int,
        limit: Int,
    ): FenceMarker? {
        var pos = lineStart
        var spaces = 0
        while (pos < limit && spaces < 3 && text[pos] == ' ') {
            pos++
            spaces++
        }
        if (pos >= limit) return null
        val marker = text[pos]
        if (marker != '`' && marker != '~') return null
        var count = 0
        while (pos + count < limit && text[pos + count] == marker) count++
        if (count < 3) return null
        val markerEndOffset = pos + count
        var lineEnd = markerEndOffset
        while (lineEnd < limit && text[lineEnd] != '\n') lineEnd++
        if (lineEnd < limit && text[lineEnd] == '\n') lineEnd++
        return FenceMarker(marker, count, markerEndOffset, lineEnd)
    }

    private fun isTrailingFenceLineBlank(
        text: String,
        start: Int,
        end: Int,
    ): Boolean {
        for (i in start until end) {
            val ch = text[i]
            if (ch != ' ' && ch != '\t' && ch != '\r' && ch != '\n') return false
        }
        return true
    }
}
