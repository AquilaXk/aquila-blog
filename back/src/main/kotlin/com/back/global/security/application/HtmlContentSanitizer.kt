package com.back.global.security.application

import org.jsoup.Jsoup

/**
 * 게시글 contentHtml 렌더링 전 XSS 위험을 줄이기 위한 HTML 정제 유틸입니다.
 *
 * 허용 태그만 유지하고, 이벤트/style/srcdoc 속성과 위험 URI 프로토콜을 제거합니다.
 * target="_blank" 링크에는 opener 참조를 막기 위한 rel 값을 보강합니다.
 */
object HtmlContentSanitizer {
    private val allowedTags =
        setOf(
            "a",
            "b",
            "blockquote",
            "br",
            "code",
            "del",
            "details",
            "div",
            "em",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "hr",
            "i",
            "img",
            "li",
            "mark",
            "ol",
            "p",
            "pre",
            "s",
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
        )

    private val blockedProtocols = listOf("javascript:", "vbscript:", "data:")
    private val uriAttributes = setOf("href", "src")

    fun sanitizeRichHtmlOrNull(rawHtml: String?): String? {
        if (rawHtml.isNullOrBlank()) return null

        val document = Jsoup.parseBodyFragment(rawHtml)
        val body = document.body()

        body.getAllElements().toList().forEach { element ->
            if (element === body) return@forEach

            if (element.tagName().lowercase() !in allowedTags) {
                element.unwrap()
                return@forEach
            }

            element.attributes().toList().forEach { attr ->
                val key = attr.key.lowercase()
                val value = attr.value.trim()

                if (key.startsWith("on") || key == "style" || key == "srcdoc") {
                    element.removeAttr(attr.key)
                    return@forEach
                }

                if (key in uriAttributes) {
                    val normalized = normalizeUriForProtocolCheck(value)
                    if (blockedProtocols.any { normalized.startsWith(it) }) {
                        element.removeAttr(attr.key)
                    }
                }
            }

            if (element.tagName().equals("a", ignoreCase = true) && element.attr("target") == "_blank") {
                val mergedRel =
                    element
                        .attr("rel")
                        .split(' ')
                        .map(String::trim)
                        .filter(String::isNotBlank)
                        .plus(listOf("noopener", "noreferrer"))
                        .distinct()
                        .joinToString(" ")
                element.attr("rel", mergedRel)
            }
        }

        val sanitized = body.html().trim()
        return sanitized.ifBlank { null }
    }

    private fun normalizeUriForProtocolCheck(value: String): String =
        value
            .filterNot { it.isWhitespace() || it.isISOControl() }
            .lowercase()
}
