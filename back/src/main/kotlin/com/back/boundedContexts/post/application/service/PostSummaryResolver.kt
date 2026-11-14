package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.dto.PostHeaderMetadataMatcher
import com.back.boundedContexts.post.model.PostSummarySource
import com.back.global.util.Utf8ChunkDigest
import java.text.BreakIterator
import java.time.Instant
import java.util.Locale

object PostSummaryResolver {
    const val MAX_GRAPHEMES = 150
    const val ALGORITHM_VERSION = "deterministic-v1"

    private const val MANUAL_VERSION = "manual-v1"
    private const val ELLIPSIS = "…"

    private val placeholders =
        setOf(
            "요약을 생성할 수 없습니다.",
            "핵심 내용을 정리 중입니다.",
            "미리보기를 불러오지 못했습니다.",
        )

    // 링크/이미지 URL 반복은 문자 단위 대안만 둔다. `[^()]+`처럼 중첩 반복을 쓰면 닫는 괄호가 없는
    // 긴 본문에서 백트래킹이 지수적으로 늘어난다.
    private val markdownImageRegex =
        Regex("!\\[[^]]*]\\((?:[^()\\s]|\\([^)]*\\))+(?:\\s+\"[^\"]*\")?\\)")
    private val markdownLinkRegex = Regex("\\[([^]]+)]\\((?:[^()]|\\([^)]*\\))+\\)")
    private val referenceLinkRegex = Regex("\\[([^]]+)]\\[[^]]*]")
    private val inlineCodeRegex = Regex("`+([^`]+?)`+")
    private val htmlTagRegex = Regex("<[^>]+>")
    private val footnoteReferenceRegex = Regex("\\[\\^[^]]+]")
    private val summaryPrefixRegex =
        Regex("^(?:요약|summary)(?:\\*\\*|__)?\\s*[:：-]?\\s*", RegexOption.IGNORE_CASE)
    private val greetingRegex =
        Regex(
            "^(?:안녕하세요(?:[.!?]|\\s|$)|시작하며(?:[.!?]|\\s|$)|" +
                "들어가며(?:[.!?]|\\s|$)|introduction(?:[.!?]|\\s|$))",
            RegexOption.IGNORE_CASE,
        )

    data class ResolvedPostSummary(
        val text: String,
        val source: PostSummarySource,
        val contentHash: String,
        val algorithmVersion: String,
        val generatedAt: Instant?,
    )

    fun resolveManual(
        content: String,
        submittedSummary: String,
    ): ResolvedPostSummary = manual(submittedSummary, content)

    fun resolveAutomatic(
        title: String,
        content: String,
        now: Instant = Instant.now(),
    ): ResolvedPostSummary {
        val normalizedContent = normalizeLineEndings(content)
        val hash = sha256(normalizedContent)
        val bodyStartOffset = skipLeadingMetadataOffset(normalizedContent, splitFrontmatterOffset(normalizedContent))
        val leading = extractLeadingSummaryBlock(normalizedContent, bodyStartOffset)
        if (leading.isNotBlank()) {
            return derived(leading, PostSummarySource.LEADING_BLOCK, hash, ALGORITHM_VERSION, now)
        }

        val prose = extractFirstMeaningfulParagraph(title, normalizedContent, bodyStartOffset)
        if (prose.isNotBlank()) {
            return derived(prose, PostSummarySource.EXTRACTED, hash, ALGORITHM_VERSION, now)
        }

        return ResolvedPostSummary(
            text = "",
            source = PostSummarySource.NONE,
            contentHash = hash,
            algorithmVersion = ALGORITHM_VERSION,
            generatedAt = now,
        )
    }

    private fun manual(
        value: String,
        content: String,
    ): ResolvedPostSummary =
        ResolvedPostSummary(
            text = limit(normalizeText(value)),
            source = PostSummarySource.MANUAL,
            contentHash = sha256(normalizeLineEndings(content)),
            algorithmVersion = MANUAL_VERSION,
            generatedAt = null,
        )

    private fun derived(
        value: String,
        source: PostSummarySource,
        hash: String,
        version: String,
        now: Instant,
    ): ResolvedPostSummary {
        val normalized = normalizeText(value)
        if (normalized.isBlank() || normalized in placeholders) {
            return ResolvedPostSummary(
                text = "",
                source = PostSummarySource.NONE,
                contentHash = hash,
                algorithmVersion = ALGORITHM_VERSION,
                generatedAt = now,
            )
        }
        return ResolvedPostSummary(limit(normalized), source, hash, version, now)
    }

    private fun splitFrontmatterOffset(content: String): Int {
        val len = content.length
        val trimmedStart = skipWhitespaceStart(content, 0, len)
        if (!content.startsWith("---", startIndex = trimmedStart)) return trimmedStart
        val firstNewline = content.indexOf('\n', startIndex = trimmedStart)
        if (firstNewline < 0 || !isTrimmedTripleDash(content, trimmedStart, firstNewline)) return trimmedStart
        var cursor = firstNewline + 1
        while (cursor <= len) {
            val nextNl = content.indexOf('\n', startIndex = cursor)
            val lineEnd = if (nextNl < 0) len else nextNl
            if (isTrimmedTripleDash(content, cursor, lineEnd)) {
                return if (lineEnd < len) skipWhitespaceStart(content, lineEnd + 1, len) else len
            }
            if (nextNl < 0) break
            cursor = nextNl + 1
        }
        return trimmedStart
    }

    private fun skipWhitespaceStart(
        text: String,
        start: Int,
        end: Int,
    ): Int {
        var pos = start
        while (pos < end && text[pos].isWhitespace()) pos++
        return pos
    }

    private fun isTrimmedTripleDash(
        text: String,
        rawStart: Int,
        rawEnd: Int,
    ): Boolean {
        var start = rawStart
        var end = rawEnd
        while (start < end && text[start].isWhitespace()) start++
        while (end > start && text[end - 1].isWhitespace()) end--
        return end - start == 3 && text[start] == '-' && text[start + 1] == '-' && text[start + 2] == '-'
    }

    private fun skipLeadingMetadataOffset(
        content: String,
        startOffset: Int,
    ): Int {
        var cursor = startOffset
        val len = content.length
        while (cursor < len) {
            val nextNl = content.indexOf('\n', startIndex = cursor)
            val lineEnd = if (nextNl < 0) len else nextNl
            val firstNonWs = skipWhitespaceStart(content, cursor, lineEnd)
            if (firstNonWs < lineEnd) {
                val colonIndex = content.indexOf(':', startIndex = firstNonWs)
                if (colonIndex !in firstNonWs until lineEnd) break
                val kind =
                    PostHeaderMetadataMatcher.matchLine(
                        content,
                        firstNonWs,
                        lineEnd,
                        colonIndex,
                        includeSummaryAliases = true,
                    )
                if (kind == PostHeaderMetadataMatcher.KIND_NONE) break
            }
            if (nextNl < 0) return len
            cursor = nextNl + 1
        }
        return cursor
    }

    private fun extractLeadingSummaryBlock(
        content: String,
        bodyStart: Int,
    ): String {
        val len = content.length
        if (bodyStart >= len) return ""
        val firstNl = content.indexOf('\n', startIndex = bodyStart)
        val firstLineEnd = if (firstNl < 0) len else firstNl
        val firstNonWs = skipWhitespaceStart(content, bodyStart, firstLineEnd)
        if (firstNonWs >= firstLineEnd || content[firstNonWs] != '>') return ""

        val quoteBuilder = StringBuilder()
        var cursor = bodyStart
        while (cursor < len) {
            val nextNl = content.indexOf('\n', startIndex = cursor)
            val lineEnd = if (nextNl < 0) len else nextNl
            val pos = skipWhitespaceStart(content, cursor, lineEnd)
            if (pos >= lineEnd || content[pos] != '>') break
            val contentStart = skipWhitespaceStart(content, pos + 1, lineEnd)
            if (quoteBuilder.isNotEmpty()) quoteBuilder.append(' ')
            quoteBuilder.append(content, contentStart, lineEnd)
            if (nextNl < 0) break
            cursor = nextNl + 1
        }

        val normalized =
            quoteBuilder
                .toString()
                .replace("**", "")
                .replace("__", "")
                .trim()
        if (!summaryPrefixRegex.containsMatchIn(normalized)) return ""
        return summaryPrefixRegex.replaceFirst(normalized, "").trim()
    }

    private fun extractFirstMeaningfulParagraph(
        title: String,
        content: String,
        bodyStart: Int,
    ): String {
        val len = content.length
        if (bodyStart >= len) return ""

        val normalizedTitle = normalizeComparable(title)
        val paragraphBuf = StringBuilder()
        var fenceChar = '\u0000'
        var fenceLength = 0
        var mathBlock = false
        var htmlBlock = false

        fun flushAndCheck(): String? {
            if (paragraphBuf.isEmpty()) return null
            val rawParagraph = paragraphBuf.toString()
            paragraphBuf.setLength(0)
            val cleaned = cleanInlineMarkdown(rawParagraph)
            if (cleaned.isBlank()) return null
            if (normalizeComparable(cleaned) == normalizedTitle) return null
            if (greetingRegex.containsMatchIn(cleaned) && graphemeCount(cleaned) < 45) return null
            if (graphemeCount(cleaned) < 12) return null
            return takeCompleteSentences(cleaned)
        }

        var cursor = bodyStart
        while (cursor < len) {
            val nextNl = content.indexOf('\n', startIndex = cursor)
            val lineEnd = if (nextNl < 0) len else nextNl
            var trimmedEnd = lineEnd
            while (trimmedEnd > cursor && content[trimmedEnd - 1].isWhitespace()) trimmedEnd--
            val trimmedStart = skipWhitespaceStart(content, cursor, trimmedEnd)

            var fenceCandidateChar = '\u0000'
            var fenceCandidateLength = 0
            if (trimmedStart < trimmedEnd &&
                trimmedStart - cursor <= 3 &&
                (content[trimmedStart] == '`' || content[trimmedStart] == '~')
            ) {
                val marker = content[trimmedStart]
                var count = 0
                while (trimmedStart + count < trimmedEnd && content[trimmedStart + count] == marker) {
                    count++
                }
                if (count >= 3) {
                    fenceCandidateChar = marker
                    fenceCandidateLength = count
                }
            }

            if (fenceChar != '\u0000') {
                if (fenceCandidateChar == fenceChar && fenceCandidateLength >= fenceLength) {
                    fenceChar = '\u0000'
                    fenceLength = 0
                }
            } else if (fenceCandidateLength >= 3) {
                flushAndCheck()?.let { return it }
                fenceChar = fenceCandidateChar
                fenceLength = fenceCandidateLength
            } else if (trimmedEnd - trimmedStart == 2 && content[trimmedStart] == '$' && content[trimmedStart + 1] == '$') {
                flushAndCheck()?.let { return it }
                mathBlock = !mathBlock
            } else if (!mathBlock) {
                if (htmlBlock) {
                    if (trimmedStart >= trimmedEnd || content.startsWith("</", startIndex = trimmedStart)) {
                        htmlBlock = false
                    }
                } else if (trimmedStart < trimmedEnd &&
                    content[trimmedStart] == '<' &&
                    !content.startsWith("<!--", startIndex = trimmedStart)
                ) {
                    flushAndCheck()?.let { return it }
                    if (!containsClosingHtmlTag(content, trimmedStart, trimmedEnd) &&
                        !endsWithSelfClosingTag(content, trimmedStart, trimmedEnd)
                    ) {
                        htmlBlock = true
                    }
                } else if (trimmedStart >= trimmedEnd) {
                    flushAndCheck()?.let { return it }
                } else if (content[cursor] == '\t' || content.startsWith("    ", startIndex = cursor)) {
                    flushAndCheck()?.let { return it }
                } else if (content[trimmedStart] == '>' ||
                    isHeadingLine(content, trimmedStart, trimmedEnd) ||
                    isListMarkerLine(content, trimmedStart, trimmedEnd) ||
                    isTableDelimiterLine(content, trimmedStart, trimmedEnd) ||
                    looksLikeTableRow(content, trimmedStart, trimmedEnd) ||
                    content.startsWith("![", startIndex = trimmedStart)
                ) {
                    flushAndCheck()?.let { return it }
                } else {
                    if (paragraphBuf.isNotEmpty()) paragraphBuf.append(' ')
                    paragraphBuf.append(content, trimmedStart, trimmedEnd)
                }
            }

            if (nextNl < 0) break
            cursor = nextNl + 1
        }

        return flushAndCheck() ?: ""
    }

    private fun containsClosingHtmlTag(
        text: String,
        start: Int,
        end: Int,
    ): Boolean {
        for (i in start until end - 1) {
            if (text[i] == '<' && text[i + 1] == '/') return true
        }
        return false
    }

    private fun endsWithSelfClosingTag(
        text: String,
        start: Int,
        end: Int,
    ): Boolean = end - start >= 2 && text[end - 2] == '/' && text[end - 1] == '>'

    private fun isHeadingLine(
        text: String,
        trimmedStart: Int,
        trimmedEnd: Int,
    ): Boolean {
        if (text[trimmedStart] != '#') return false
        var pos = trimmedStart
        var hashes = 0
        while (pos < trimmedEnd && text[pos] == '#' && hashes < 7) {
            pos++
            hashes++
        }
        return hashes in 1..6 && pos < trimmedEnd && text[pos].isWhitespace()
    }

    private fun isListMarkerLine(
        text: String,
        trimmedStart: Int,
        trimmedEnd: Int,
    ): Boolean {
        val first = text[trimmedStart]
        if (first == '-' || first == '+' || first == '*') {
            return trimmedStart + 1 < trimmedEnd && text[trimmedStart + 1].isWhitespace()
        }
        if (first in '0'..'9') {
            var pos = trimmedStart + 1
            while (pos < trimmedEnd && text[pos] in '0'..'9') {
                pos++
            }
            if (pos >= trimmedEnd) return false
            val sep = text[pos]
            if (sep != '.' && sep != ')') return false
            return pos + 1 < trimmedEnd && text[pos + 1].isWhitespace()
        }
        return false
    }

    private fun isTableDelimiterLine(
        text: String,
        trimmedStart: Int,
        trimmedEnd: Int,
    ): Boolean {
        var pos = trimmedStart
        if (text[pos] == '|') {
            pos++
        }
        var cells = 0
        while (pos < trimmedEnd) {
            while (pos < trimmedEnd && text[pos].isWhitespace()) pos++
            if (pos >= trimmedEnd) break
            if (text[pos] == ':') pos++
            var dashes = 0
            while (pos < trimmedEnd && text[pos] == '-') {
                dashes++
                pos++
            }
            if (dashes < 3) return false
            if (pos < trimmedEnd && text[pos] == ':') pos++
            while (pos < trimmedEnd && text[pos].isWhitespace()) pos++
            cells++
            if (pos < trimmedEnd) {
                if (text[pos] != '|') return false
                pos++
            }
        }
        return cells >= 2
    }

    private fun looksLikeTableRow(
        text: String,
        trimmedStart: Int,
        trimmedEnd: Int,
    ): Boolean {
        if (text[trimmedStart] != '|' && text[trimmedEnd - 1] != '|') return false
        var pipes = 0
        for (i in trimmedStart until trimmedEnd) {
            if (text[i] == '|') {
                pipes++
                if (pipes >= 2) return true
            }
        }
        return false
    }

    private fun cleanInlineMarkdown(value: String): String {
        var current = value
        if ("![" in current) current = markdownImageRegex.replace(current, " ")
        if ("](" in current) current = markdownLinkRegex.replace(current, "$1")
        if ("][" in current) current = referenceLinkRegex.replace(current, "$1")
        if ('`' in current) current = inlineCodeRegex.replace(current, "$1")
        if ("[^" in current) current = footnoteReferenceRegex.replace(current, " ")
        if ('<' in current) current = htmlTagRegex.replace(current, " ")
        return normalizeText(
            current
                .replace("**", "")
                .replace("__", "")
                .replace("~~", ""),
        )
    }

    private fun takeCompleteSentences(value: String): String {
        val iterator = BreakIterator.getSentenceInstance(Locale.KOREAN)
        iterator.setText(value)
        val sentences = mutableListOf<String>()
        var start = iterator.first()
        var end = iterator.next()
        while (end != BreakIterator.DONE && sentences.size < 2) {
            val sentence = value.substring(start, end).trim()
            if (sentence.isNotBlank()) sentences += sentence
            start = end
            end = iterator.next()
        }
        return sentences.joinToString(" ").ifBlank { value }
    }

    private fun limit(normalized: String): String {
        if (graphemeCount(normalized) <= MAX_GRAPHEMES) return normalized
        val contentLimit = MAX_GRAPHEMES - graphemeCount(ELLIPSIS)
        return takeGraphemes(normalized, contentLimit).trimEnd() + ELLIPSIS
    }

    private fun graphemeCount(value: String): Int {
        val iterator = BreakIterator.getCharacterInstance(Locale.ROOT)
        iterator.setText(value)
        var count = 0
        iterator.first()
        while (iterator.next() != BreakIterator.DONE) count += 1
        return count
    }

    internal fun takeGraphemes(
        value: String,
        count: Int,
    ): String {
        if (count <= 0 || value.isEmpty()) return ""
        val iterator = BreakIterator.getCharacterInstance(Locale.ROOT)
        iterator.setText(value)
        var boundary = iterator.first()
        for (i in 0 until count) {
            val next = iterator.next()
            if (next == BreakIterator.DONE) break
            boundary = next
        }
        return value.substring(0, boundary)
    }

    private val WHITESPACE_REGEX = Regex("\\s+")
    private val NON_ALPHANUMERIC_REGEX = Regex("[^\\p{L}\\p{N}]+")

    private fun normalizeText(value: String): String = value.replace(WHITESPACE_REGEX, " ").trim()

    private fun normalizeComparable(value: String): String =
        normalizeText(value)
            .lowercase(Locale.ROOT)
            .replace(NON_ALPHANUMERIC_REGEX, "")

    private fun normalizeLineEndings(value: String): String {
        if ('\r' !in value) return value
        return value
            .replace("\r\n", "\n")
            .replace('\r', '\n')
    }

    private fun sha256(value: String): String = Utf8ChunkDigest.sha256Hex(value)
}
