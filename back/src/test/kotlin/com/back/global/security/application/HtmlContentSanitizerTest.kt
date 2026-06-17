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
