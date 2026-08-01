package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.model.PostSummarySource
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.text.BreakIterator
import java.time.Instant
import java.util.Locale

object PostSummaryResolver {
    const val MAX_GRAPHEMES = 150
    const val ALGORITHM_VERSION = "deterministic-v1"

    private const val MANUAL_VERSION = "manual-v1"
    private const val MIGRATED_VERSION = "legacy-frontmatter-v1"
    private const val ELLIPSIS = "…"

    private val placeholders =
        setOf(
            "요약을 생성할 수 없습니다.",
            "핵심 내용을 정리 중입니다.",
            "미리보기를 불러오지 못했습니다.",
        )
    private val markdownImageRegex =
        Regex("!\\[[^]]*]\\((?:[^()\\s]+|\\([^)]*\\))+(?:\\s+\"[^\"]*\")?\\)")
    private val markdownLinkRegex = Regex("\\[([^]]+)]\\((?:[^()]+|\\([^)]*\\))+\\)")
    private val referenceLinkRegex = Regex("\\[([^]]+)]\\[[^]]*]")
    private val inlineCodeRegex = Regex("`+([^`]+?)`+")
    private val htmlTagRegex = Regex("<[^>]+>")
    private val footnoteReferenceRegex = Regex("\\[\\^[^]]+]")
    private val headingRegex = Regex("^#{1,6}\\s+(.*)$")
    private val listMarkerRegex = Regex("^\\s*(?:[-+*]|\\d+[.)])\\s+")
    private val tableDelimiterRegex =
        Regex("^\\s*\\|?\\s*:?-{3,}:?\\s*(?:\\|\\s*:?-{3,}:?\\s*)+\\|?\\s*$")
    private val fenceRegex = Regex("^\\s{0,3}(`{3,}|~{3,}).*$")
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

    fun resolveForCreate(
        title: String,
        content: String,
        submittedSummary: String?,
        now: Instant = Instant.now(),
    ): ResolvedPostSummary =
        submittedSummary
            ?.takeIf { it.isNotBlank() }
            ?.let { manual(it, content) }
            ?: resolveAutomatic(title, content, now)

    fun resolveForModify(
        title: String,
        content: String,
        submittedSummary: String?,
        existingText: String?,
        existingSource: PostSummarySource,
        now: Instant = Instant.now(),
    ): ResolvedPostSummary {
        if (
            submittedSummary == null &&
            existingSource == PostSummarySource.MANUAL &&
            !existingText.isNullOrBlank()
        ) {
            return manual(existingText, content)
        }
        if (!submittedSummary.isNullOrBlank()) return manual(submittedSummary, content)
        return resolveAutomatic(title, content, now)
    }

    fun resolveAutomatic(
        title: String,
        content: String,
        now: Instant = Instant.now(),
    ): ResolvedPostSummary {
        val normalizedContent = normalizeLineEndings(content)
        val hash = sha256(normalizedContent)
        val split = splitFrontmatter(normalizedContent)
        val legacy = extractLegacySummary(split.metadataLines)
        if (legacy.isNotBlank()) {
            return derived(legacy, PostSummarySource.MIGRATED, hash, MIGRATED_VERSION, now)
        }

        val leading = extractLeadingSummaryBlock(split.body)
        if (leading.isNotBlank()) {
            return derived(leading, PostSummarySource.LEADING_BLOCK, hash, ALGORITHM_VERSION, now)
        }

        val prose = extractFirstMeaningfulParagraph(title, split.body)
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

    private data class FrontmatterSplit(
        val metadataLines: List<String>,
        val body: String,
    )

    private fun splitFrontmatter(content: String): FrontmatterSplit {
        val trimmed = content.trimStart()
        val lines = trimmed.lines()
        if (lines.firstOrNull()?.trim() != "---") return FrontmatterSplit(emptyList(), trimmed)
        val closing = lines.drop(1).indexOfFirst { it.trim() == "---" }
        if (closing < 0) return FrontmatterSplit(emptyList(), trimmed)
        val closingIndex = closing + 1
        return FrontmatterSplit(
            metadataLines = lines.subList(1, closingIndex),
            body = lines.drop(closingIndex + 1).joinToString("\n").trimStart(),
        )
    }

    private fun extractLegacySummary(metadataLines: List<String>): String {
        for (line in metadataLines) {
            val separator = line.indexOf(':')
            if (separator <= 0) continue
            if (!line.substring(0, separator).trim().equals("summary", ignoreCase = true)) continue
            val decoded = decodeScalar(line.substring(separator + 1))
            val normalized = normalizeText(decoded)
            return normalized.takeUnless { it in placeholders }.orEmpty()
        }
        return ""
    }

    private fun decodeScalar(raw: String): String {
        val value = raw.trim()
        if (value.length < 2) return value
        if (value.first() == '\'' && value.last() == '\'') {
            return value.substring(1, value.lastIndex).replace("''", "'")
        }
        if (value.first() != '"' || value.last() != '"') return value

        val body = value.substring(1, value.lastIndex)
        val out = StringBuilder(body.length)
        var index = 0
        while (index < body.length) {
            val ch = body[index]
            if (ch != '\\' || index + 1 >= body.length) {
                out.append(ch)
                index += 1
                continue
            }
            when (val escaped = body[index + 1]) {
                '"' -> out.append('"')
                '\\' -> out.append('\\')
                'n', 'r', 't' -> out.append(' ')
                else -> out.append(escaped)
            }
            index += 2
        }
        return out.toString()
    }

    private fun extractLeadingSummaryBlock(body: String): String {
        val lines = body.lines()
        val firstContentIndex = lines.indexOfFirst { it.isNotBlank() }
        if (
            firstContentIndex < 0 ||
            !lines[firstContentIndex].trimStart().startsWith('>')
        ) {
            return ""
        }

        val quoteLines = mutableListOf<String>()
        for (line in lines.drop(firstContentIndex)) {
            val trimmed = line.trimStart()
            if (!trimmed.startsWith('>')) break
            quoteLines += trimmed.removePrefix(">").trimStart()
        }
        if (quoteLines.isEmpty()) return ""

        val normalized =
            quoteLines
                .joinToString(" ")
                .replace("**", "")
                .replace("__", "")
                .trim()
        if (!summaryPrefixRegex.containsMatchIn(normalized)) return ""
        return summaryPrefixRegex.replaceFirst(normalized, "").trim()
    }

    private fun extractFirstMeaningfulParagraph(
        title: String,
        body: String,
    ): String {
        val paragraphs = collectProseParagraphs(body)
        val normalizedTitle = normalizeComparable(title)
        for (paragraph in paragraphs) {
            val cleaned = cleanInlineMarkdown(paragraph)
            if (cleaned.isBlank()) continue
            if (normalizeComparable(cleaned) == normalizedTitle) continue
            if (greetingRegex.containsMatchIn(cleaned) && graphemeCount(cleaned) < 45) continue
            if (graphemeCount(cleaned) < 12) continue
            return takeCompleteSentences(cleaned)
        }
        return ""
    }

    private fun collectProseParagraphs(body: String): List<String> {
        val paragraphs = mutableListOf<String>()
        val current = mutableListOf<String>()
        var fenceChar: Char? = null
        var fenceLength = 0
        var mathBlock = false
        var htmlBlock = false

        fun flush() {
            if (current.isNotEmpty()) {
                paragraphs += current.joinToString(" ")
                current.clear()
            }
        }

        for (rawLine in body.lines()) {
            val line = rawLine.trimEnd()
            val trimmed = line.trimStart()
            val fence = fenceRegex.matchEntire(line)
            if (fenceChar != null) {
                if (fence != null) {
                    val marker = fence.groupValues[1]
                    if (marker.first() == fenceChar && marker.length >= fenceLength) {
                        fenceChar = null
                        fenceLength = 0
                    }
                }
                continue
            }
            if (fence != null) {
                flush()
                val marker = fence.groupValues[1]
                fenceChar = marker.first()
                fenceLength = marker.length
                continue
            }
            if (trimmed == "$$") {
                flush()
                mathBlock = !mathBlock
                continue
            }
            if (mathBlock) continue
            if (htmlBlock) {
                if (trimmed.isBlank() || trimmed.startsWith("</")) htmlBlock = false
                continue
            }
            if (trimmed.startsWith('<') && !trimmed.startsWith("<!--")) {
                flush()
                if (!trimmed.contains("</") && !trimmed.endsWith("/>")) htmlBlock = true
                continue
            }
            if (line.startsWith("    ") || line.startsWith('\t')) {
                flush()
                continue
            }
            if (trimmed.isBlank()) {
                flush()
                continue
            }
            if (
                trimmed.startsWith('>') ||
                headingRegex.matches(trimmed) ||
                listMarkerRegex.containsMatchIn(trimmed)
            ) {
                flush()
                continue
            }
            if (tableDelimiterRegex.matches(trimmed) || looksLikeTableRow(trimmed)) {
                flush()
                continue
            }
            if (trimmed.startsWith("![")) {
                flush()
                continue
            }
            current += trimmed
        }
        flush()
        return paragraphs
    }

    private fun looksLikeTableRow(value: String): Boolean =
        value.count { it == '|' } >= 2 && (value.startsWith('|') || value.endsWith('|'))

    private fun cleanInlineMarkdown(value: String): String =
        normalizeText(
            value
                .replace(markdownImageRegex, " ")
                .replace(markdownLinkRegex, "$1")
                .replace(referenceLinkRegex, "$1")
                .replace(inlineCodeRegex, "$1")
                .replace(footnoteReferenceRegex, " ")
                .replace(htmlTagRegex, " ")
                .replace("**", "")
                .replace("__", "")
                .replace("~~", ""),
        )

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
        return limit(sentences.joinToString(" ").ifBlank { value })
    }

    private fun limit(value: String): String {
        val normalized = normalizeText(value)
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

    private fun takeGraphemes(
        value: String,
        count: Int,
    ): String {
        if (count <= 0) return ""
        val iterator = BreakIterator.getCharacterInstance(Locale.ROOT)
        iterator.setText(value)
        iterator.first()
        var boundary = 0
        repeat(count) {
            val next = iterator.next()
            if (next == BreakIterator.DONE) return value
            boundary = next
        }
        return value.substring(0, boundary)
    }

    private fun normalizeText(value: String): String = value.replace(Regex("\\s+"), " ").trim()

    private fun normalizeComparable(value: String): String =
        normalizeText(value)
            .lowercase(Locale.ROOT)
            .replace(Regex("[^\\p{L}\\p{N}]+"), "")

    private fun normalizeLineEndings(value: String): String =
        value
            .replace("\r\n", "\n")
            .replace('\r', '\n')

    private fun sha256(value: String): String =
        MessageDigest
            .getInstance("SHA-256")
            .digest(value.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }
}
