package com.back.global.security.application

import org.jsoup.Jsoup
import org.jsoup.safety.Cleaner
import org.jsoup.safety.Safelist
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

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

    private const val SANITIZER_BASE_URI = "https://aquilaxk.local/"

    private val safelist =
        Safelist
            .none()
            .addTags(
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
            ).addAttributes(
                ":all",
                "class",
                "id",
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

        val document = Jsoup.parseBodyFragment(rawHtml, SANITIZER_BASE_URI)
        val body = cleaner.clean(document).body()

        body.getAllElements().forEach { element ->
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
            -> unknown(contentHtmlSanitizerPolicyVersion)

            ContentHtmlTrustState.REJECTED ->
                ContentHtmlTrustResult(null, null, contentHtmlSanitizerPolicyVersion, ContentHtmlTrustState.REJECTED)

            ContentHtmlTrustState.TRUSTED_CURRENT -> {
                if (contentHtmlHash.isNullOrBlank() || contentHtmlSanitizerPolicyVersion != CURRENT_POLICY_VERSION) {
                    unknown(contentHtmlSanitizerPolicyVersion)
                } else if (contentHtml == null || sha256Utf8(contentHtml) != contentHtmlHash) {
                    ContentHtmlTrustResult(null, null, contentHtmlSanitizerPolicyVersion, ContentHtmlTrustState.REJECTED)
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

    fun sha256Utf8(value: String): String =
        MessageDigest
            .getInstance("SHA-256")
            .digest(value.toByteArray(StandardCharsets.UTF_8))
            .joinToString(separator = "") { byte -> "%02x".format(byte.toInt() and 0xff) }

    private fun unknown(policyVersion: String? = null): ContentHtmlTrustResult =
        ContentHtmlTrustResult(null, null, policyVersion, ContentHtmlTrustState.UNKNOWN)
}
