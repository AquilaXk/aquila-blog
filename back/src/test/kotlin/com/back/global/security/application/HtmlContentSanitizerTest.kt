package com.back.global.security.application

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("HtmlContentSanitizer XSS 회귀 테스트")
class HtmlContentSanitizerTest {
    @Test
    @DisplayName("이벤트 속성, srcdoc, 비허용 active content 태그를 제거한다")
    fun removesExecutableHtmlPayloads() {
        // given
        val rawHtml =
            """
            <p>safe</p>
            <img src="https://cdn.example.com/a.png" onerror="alert(1)" style="background:url(javascript:alert(1))">
            <svg onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a></svg>
            <iframe srcdoc="<script>alert(4)</script>"></iframe>
            """.trimIndent()

        // when
        val sanitized = HtmlContentSanitizer.sanitizeRichHtmlOrNull(rawHtml)

        // then
        assertThat(sanitized).contains("<p>safe</p>")
        assertThat(sanitized).contains("<img src=\"https://cdn.example.com/a.png\">")
        assertThat(sanitized).doesNotContain("onerror")
        assertThat(sanitized).doesNotContain("style=")
        assertThat(sanitized).doesNotContain("srcdoc")
        assertThat(sanitized).doesNotContain("<svg")
        assertThat(sanitized).doesNotContain("<script")
        assertThat(sanitized).doesNotContain("<iframe")
        assertThat(sanitized).doesNotContain("javascript:")
    }

    @Test
    @DisplayName("href/src 위험 프로토콜과 protocol 내부 제어문자 우회 payload를 제거한다")
    fun removesDangerousUriProtocols() {
        // given
        val rawHtml =
            """
            <a href="javascript:alert(1)">javascript</a>
            <a href="java&#x09;script:alert(2)">tab-obfuscated</a>
            <a href="vbscript:alert(3)">vbscript</a>
            <img src="data:text/html,<script>alert(4)</script>">
            """.trimIndent()

        // when
        val sanitized = HtmlContentSanitizer.sanitizeRichHtmlOrNull(rawHtml)

        // then
        assertThat(sanitized).contains("<a>javascript</a>")
        assertThat(sanitized).contains("<a>tab-obfuscated</a>")
        assertThat(sanitized).contains("<a>vbscript</a>")
        assertThat(sanitized).contains("<img>")
        assertThat(sanitized).doesNotContain("href=")
        assertThat(sanitized).doesNotContain("src=")
        assertThat(sanitized).doesNotContain("javascript:")
        assertThat(sanitized).doesNotContain("vbscript:")
        assertThat(sanitized).doesNotContain("data:")
    }

    @Test
    @DisplayName("srcset 같은 비필수 URL 속성은 정제 결과에 남기지 않는다")
    fun removesNonEssentialUriAttributes() {
        // given
        val rawHtml =
            """
            <img src="https://cdn.example.com/a.png" srcset="javascript:alert(1) 1x, https://cdn.example.com/a@2x.png 2x">
            <table background="javascript:alert(2)"><tr><td formaction="javascript:alert(3)">cell</td></tr></table>
            """.trimIndent()

        // when
        val sanitized = HtmlContentSanitizer.sanitizeRichHtmlOrNull(rawHtml)

        // then
        assertThat(sanitized).contains("<img src=\"https://cdn.example.com/a.png\">")
        assertThat(sanitized).contains("<table>")
        assertThat(sanitized).contains("<td>cell</td>")
        assertThat(sanitized).doesNotContain("srcset")
        assertThat(sanitized).doesNotContain("background")
        assertThat(sanitized).doesNotContain("formaction")
        assertThat(sanitized).doesNotContain("javascript:")
    }

    @Test
    @DisplayName("Markdown 코드 렌더링에 필요한 class와 data 속성은 유지한다")
    fun preservesMarkdownRenderingMetadataAttributes() {
        // given
        val rawHtml =
            """
            <pre class="aq-pretty-pre" data-language="kotlin" data-prism-source="println(1)">
            <code class="language-kotlin" data-prism-language="kotlin" data-raw-code="println(1)">
            <span class="line" data-line="true">println(1)</span>
            </code>
            </pre>
            """.trimIndent()

        // when
        val sanitized = HtmlContentSanitizer.sanitizeRichHtmlOrNull(rawHtml)

        // then
        assertThat(sanitized).contains("class=\"aq-pretty-pre\"")
        assertThat(sanitized).contains("data-language=\"kotlin\"")
        assertThat(sanitized).contains("data-prism-source=\"println(1)\"")
        assertThat(sanitized).contains("class=\"language-kotlin\"")
        assertThat(sanitized).contains("data-prism-language=\"kotlin\"")
        assertThat(sanitized).contains("data-raw-code=\"println(1)\"")
        assertThat(sanitized).contains("class=\"line\"")
        assertThat(sanitized).contains("data-line=\"true\"")
    }

    @Test
    @DisplayName("상대 경로 href/src는 절대 URL로 바꾸지 않고 유지한다")
    fun preservesRelativeHrefAndSrc() {
        // given
        val rawHtml = """<a href="/posts/1">post</a><img src="/images/a.png" alt="thumbnail">"""

        // when
        val sanitized = HtmlContentSanitizer.sanitizeRichHtmlOrNull(rawHtml)

        // then
        assertThat(sanitized).contains("""<a href="/posts/1">post</a>""")
        assertThat(sanitized).contains("""<img src="/images/a.png" alt="thumbnail">""")
    }

    @Test
    @DisplayName("target blank 링크에는 opener 참조 차단 rel을 보강한다")
    fun addsNoopenerNoreferrerToBlankTargets() {
        // given
        val rawHtml = """<a target="_blank" rel="nofollow" href="https://example.com">external</a>"""

        // when
        val sanitized = HtmlContentSanitizer.sanitizeRichHtmlOrNull(rawHtml)

        // then
        assertThat(sanitized)
            .isEqualTo("""<a target="_blank" rel="nofollow noopener noreferrer" href="https://example.com">external</a>""")
    }
}
