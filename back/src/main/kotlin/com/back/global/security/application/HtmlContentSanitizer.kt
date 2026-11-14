package com.back.global.security.application

import com.back.global.util.Utf8ChunkDigest
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.nodes.Node
import org.jsoup.safety.Cleaner
import org.jsoup.safety.Safelist
import org.jsoup.select.NodeFilter
import org.jsoup.select.NodeTraversor

enum class ContentHtmlTrustState {
    TRUSTED_CURRENT,
    UNKNOWN,
    REJECTED,
}

data class ContentHtmlTrustResult(
    val contentHtml: String?,
    val contentHtmlHash: String?,
    val contentHtmlSanitizerPolicyVersion: String?,
    val contentHtmlTrustState: ContentHtmlTrustState,
)

/**
 * 게시글 contentHtml 렌더링 전 XSS 위험을 줄이기 위한 HTML 정제 유틸입니다.
 *
 * 허용 태그만 유지하고, 이벤트/style/srcdoc 속성과 위험 URI 프로토콜을 제거합니다.
 * target="_blank" 링크에는 opener 참조를 막기 위한 rel 값을 보강합니다.
 */
object HtmlContentSanitizer {
    const val CURRENT_POLICY_VERSION = "content-html-v1"
    const val MAX_RAW_HTML_LENGTH = 524_288

    private const val SANITIZER_BASE_URI = "https://aquilaxk.local/"

    private val safelist =
        Safelist
            .none()
            .addTags(
                "a",
                "abbr",
                "b",
                "blockquote",
                "br",
                "code",
                "del",
                "details",
                "dfn",
                "div",
                "em",
                "figcaption",
                "figure",
                "h1",
                "h2",
                "h3",
                "h4",
                "h5",
                "h6",
                "hr",
                "i",
                "img",
                "input",
                "kbd",
                "li",
                "mark",
                "ol",
                "p",
                "pre",
                "s",
                "samp",
                "span",
                "strong",
                "sub",
                "summary",
                "sup",
                "table",
                "tbody",
                "td",
                "th",
                "thead",
                "tr",
                "u",
                "ul",
                "var",
            ).addAttributes(
                ":all",
                "class",
                "title",
                "role",
                "aria-hidden",
                "aria-label",
                "aria-live",
                "data-aq-mermaid",
                "data-callout-type",
                "data-has-title",
                "data-language",
                "data-line",
                "data-mermaid-rendered",
                "data-mermaid-source",
                "data-prism-language",
                "data-prism-source",
                "data-raw-code",
                "data-theme",
            ).addAttributes("a", "href", "rel", "target")
            .addAttributes("img", "alt", "decoding", "height", "loading", "src", "width")
            .addAttributes("input", "checked", "disabled", "type")
            .addAttributes("ol", "start", "type")
            .addAttributes("li", "value")
            .addAttributes("details", "open")
            .addAttributes("td", "align", "colspan", "rowspan")
            .addAttributes("th", "align", "colspan", "rowspan")
            .addProtocols("a", "href", "http", "https", "mailto")
            .addProtocols("img", "src", "http", "https")
            .preserveRelativeLinks(true)

    private val cleaner = Cleaner(safelist)

    fun sanitizeRichHtmlOrNull(rawHtml: String?): String? {
        if (rawHtml.isNullOrBlank()) return null
        if (rawHtml.length > MAX_RAW_HTML_LENGTH) return null

        val document = Jsoup.parseBodyFragment(rawHtml, SANITIZER_BASE_URI)
        val body = cleaner.clean(document).body()

        NodeTraversor.filter(
            object : NodeFilter {
                override fun head(
                    node: Node,
                    depth: Int,
                ): NodeFilter.FilterResult {
                    if (node is Element) {
                        when (node.normalName()) {
                            "input" -> {
                                if (!node.attr("type").equals("checkbox", ignoreCase = true)) {
                                    return NodeFilter.FilterResult.REMOVE
                                }
                                node.attr("type", "checkbox")
                                node.attr("disabled", "")
                            }
                            "a" -> {
                                if (node.attr("target").trim().equals("_blank", ignoreCase = true)) {
                                    node.attr("rel", mergeBlankTargetRel(node.attr("rel")))
                                }
                            }
                        }
                    }
                    return NodeFilter.FilterResult.CONTINUE
                }
            },
            body,
        )

        val sanitized = body.html().trim()
        if (sanitized.isBlank() || sanitized.length > MAX_RAW_HTML_LENGTH) return null
        return sanitized
    }

    private const val REL_NOOPENER_FLAG = 1
    private const val REL_NOREFERRER_FLAG = 2

    private fun mergeBlankTargetRel(existingRel: String): String {
        if (existingRel.isBlank()) return "noopener noreferrer"

        var flags = 0
        val sb = StringBuilder(existingRel.length + 21)
        var cursor = 0
        val len = existingRel.length
        while (cursor < len) {
            val spaceIndex = existingRel.indexOf(' ', cursor)
            val rawEnd = if (spaceIndex == -1) len else spaceIndex
            var tokStart = cursor
            var tokEnd = rawEnd
            while (tokStart < tokEnd && existingRel[tokStart].isWhitespace()) tokStart++
            while (tokEnd > tokStart && existingRel[tokEnd - 1].isWhitespace()) tokEnd--
            if (tokStart < tokEnd) {
                val tokLen = tokEnd - tokStart
                val appendToken =
                    if (tokLen == 8 && existingRel.regionMatches(tokStart, "noopener", 0, 8)) {
                        val first = (flags and REL_NOOPENER_FLAG) == 0
                        flags = flags or REL_NOOPENER_FLAG
                        first
                    } else if (tokLen == 10 && existingRel.regionMatches(tokStart, "noreferrer", 0, 10)) {
                        val first = (flags and REL_NOREFERRER_FLAG) == 0
                        flags = flags or REL_NOREFERRER_FLAG
                        first
                    } else {
                        !containsSpaceDelimitedToken(sb, existingRel, tokStart, tokEnd)
                    }
                if (appendToken) {
                    if (sb.isNotEmpty()) sb.append(' ')
                    sb.append(existingRel, tokStart, tokEnd)
                }
            }
            cursor = if (spaceIndex == -1) len else spaceIndex + 1
        }
        if ((flags and REL_NOOPENER_FLAG) == 0) {
            sb.append(' ').append("noopener")
        }
        if ((flags and REL_NOREFERRER_FLAG) == 0) {
            sb.append(' ').append("noreferrer")
        }
        return sb.toString()
    }

    private fun containsSpaceDelimitedToken(
        sb: StringBuilder,
        text: String,
        tokStart: Int,
        tokEnd: Int,
    ): Boolean {
        val tokLen = tokEnd - tokStart
        val sbLen = sb.length
        var pos = 0
        while (pos < sbLen) {
            val nextSpace = sb.indexOf(" ", pos)
            val end = if (nextSpace == -1) sbLen else nextSpace
            if (end - pos == tokLen && matchesRange(sb, pos, text, tokStart, tokLen)) {
                return true
            }
            pos = if (nextSpace == -1) sbLen else nextSpace + 1
        }
        return false
    }

    private fun matchesRange(
        sb: StringBuilder,
        sbOffset: Int,
        text: String,
        textOffset: Int,
        len: Int,
    ): Boolean {
        for (i in 0 until len) {
            if (sb[sbOffset + i] != text[textOffset + i]) return false
        }
        return true
    }

    fun sanitizeForPersistence(rawHtml: String?): ContentHtmlTrustResult {
        if (rawHtml == null) return unknown()

        val sanitized =
            sanitizeRichHtmlOrNull(rawHtml)
                ?: return ContentHtmlTrustResult(null, null, CURRENT_POLICY_VERSION, ContentHtmlTrustState.REJECTED)

        return ContentHtmlTrustResult(
            contentHtml = sanitized,
            contentHtmlHash = sha256Utf8(sanitized),
            contentHtmlSanitizerPolicyVersion = CURRENT_POLICY_VERSION,
            contentHtmlTrustState = ContentHtmlTrustState.TRUSTED_CURRENT,
        )
    }

    fun verifyStored(
        contentHtml: String?,
        contentHtmlHash: String?,
        contentHtmlSanitizerPolicyVersion: String?,
        contentHtmlTrustState: ContentHtmlTrustState?,
    ): ContentHtmlTrustResult =
        when (contentHtmlTrustState) {
            null,
            ContentHtmlTrustState.UNKNOWN,
            -> unknown()

            ContentHtmlTrustState.REJECTED ->
                ContentHtmlTrustResult(null, null, null, ContentHtmlTrustState.REJECTED)

            ContentHtmlTrustState.TRUSTED_CURRENT -> {
                if (contentHtmlHash.isNullOrBlank() || contentHtmlSanitizerPolicyVersion != CURRENT_POLICY_VERSION) {
                    unknown()
                } else if (
                    contentHtml == null ||
                    contentHtml.length > MAX_RAW_HTML_LENGTH ||
                    sha256Utf8(contentHtml) != contentHtmlHash
                ) {
                    ContentHtmlTrustResult(null, null, null, ContentHtmlTrustState.REJECTED)
                } else {
                    ContentHtmlTrustResult(
                        contentHtml = contentHtml,
                        contentHtmlHash = contentHtmlHash,
                        contentHtmlSanitizerPolicyVersion = contentHtmlSanitizerPolicyVersion,
                        contentHtmlTrustState = ContentHtmlTrustState.TRUSTED_CURRENT,
                    )
                }
            }
        }

    fun sha256Utf8(value: String): String = Utf8ChunkDigest.sha256Hex(value)

    private fun unknown(): ContentHtmlTrustResult = ContentHtmlTrustResult(null, null, null, ContentHtmlTrustState.UNKNOWN)
}
