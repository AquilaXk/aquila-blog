package com.back.global.security.application

import org.jsoup.Jsoup

/**
 * HtmlContentSanitizer는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
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

    /**
     * 입력 HTML을 정제해 렌더링/XSS 위험을 줄입니다.
     * 애플리케이션 계층에서 트랜잭션 경계와 후속 처리(캐시/큐/이벤트)를 함께 관리합니다.
     */
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
                    val normalized = value.lowercase()
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
}
