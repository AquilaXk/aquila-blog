package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.model.PostSummarySource
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.text.BreakIterator
import java.time.Instant
import java.util.Locale

@org.junit.jupiter.api.DisplayName("PostSummaryResolver 테스트")
class PostSummaryResolverTest {
    private val fixedNow = Instant.parse("2026-08-01T00:00:00Z")

    @Test
    fun `manual summary wins without rewriting author wording`() {
        val resolved =
            PostSummaryResolver.resolveForCreate(
                title = "캐시 정책",
                content = "본문입니다.",
                submittedSummary = "이 글은 stale-if-error와 Cache-Control을 설명합니다.",
                now = fixedNow,
            )

        assertThat(resolved.source).isEqualTo(PostSummarySource.MANUAL)
        assertThat(resolved.text).isEqualTo("이 글은 stale-if-error와 Cache-Control을 설명합니다.")
        assertThat(resolved.generatedAt).isNull()
    }

    @Test
    fun `legacy frontmatter summary is migrated with CRLF and escaped quotes`() {
        val content =
            "---\r\n" +
                "summary: \"Cache-Control과 \\\"aud\\\" 클레임을 설명합니다.\"\r\n" +
                "---\r\n" +
                "본문입니다."

        val resolved = PostSummaryResolver.resolveForCreate("JWT", content, null, fixedNow)

        assertThat(resolved.source).isEqualTo(PostSummarySource.MIGRATED)
        assertThat(resolved.text).isEqualTo("Cache-Control과 \"aud\" 클레임을 설명합니다.")
        assertThat(resolved.algorithmVersion).isEqualTo("legacy-frontmatter-v1")
    }

    @Test
    fun `leading explicit summary block wins over ordinary prose`() {
        val content =
            """
            > **요약:** OAuth 2.0은 권한 위임을 위한 프레임워크입니다.
            > OIDC는 그 위에 인증 계층을 추가합니다.

            안녕하세요. 긴 도입부입니다.
            """.trimIndent()

        val resolved = PostSummaryResolver.resolveForCreate("OAuth", content, null, fixedNow)

        assertThat(resolved.source).isEqualTo(PostSummarySource.LEADING_BLOCK)
        assertThat(resolved.text).isEqualTo("OAuth 2.0은 권한 위임을 위한 프레임워크입니다. OIDC는 그 위에 인증 계층을 추가합니다.")
    }

    @Test
    fun `extractor skips title code image table and uses first two complete sentences`() {
        val content =
            """
            # 자동 요약

            ````kotlin
            ```text
            raw code
            ```
            ````

            ![diagram](https://example.com/diagram.png)

            | 항목 | 값 |
            | --- | --- |
            | cache | enabled |

            첫 번째 핵심 문장입니다. 두 번째 핵심 문장입니다. 세 번째 문장은 포함하지 않습니다.
            """.trimIndent()

        val resolved = PostSummaryResolver.resolveForCreate("자동 요약", content, null, fixedNow)

        assertThat(resolved.source).isEqualTo(PostSummarySource.EXTRACTED)
        assertThat(resolved.text).isEqualTo("첫 번째 핵심 문장입니다. 두 번째 핵심 문장입니다.")
        assertThat(resolved.text).doesNotContain("raw code", "diagram", "cache")
    }

    @Test
    fun `code image and html only content resolves to none without raw markdown fallback`() {
        val content =
            """
            ~~~kotlin
            println("secret")
            ~~~

            ![only image](https://example.com/image.png)

            <details><summary>접기</summary>내부</details>
            """.trimIndent()

        val resolved = PostSummaryResolver.resolveForCreate("제목", content, null, fixedNow)

        assertThat(resolved.source).isEqualTo(PostSummarySource.NONE)
        assertThat(resolved.text).isEmpty()
    }

    @Test
    fun `technical punctuation and link labels are preserved`() {
        val content =
            "[HTTP 캐시 정책](https://example.com/cache)은 stale-if-error, Cache-Control, --dry-run을 함께 설명하는 충분히 긴 문장입니다."

        val resolved = PostSummaryResolver.resolveForCreate("캐시", content, null, fixedNow)

        assertThat(resolved.text).contains("HTTP 캐시 정책")
        assertThat(resolved.text).contains("stale-if-error", "Cache-Control", "--dry-run")
        assertThat(resolved.text).doesNotContain("https://")
    }

    @Test
    fun `existing manual summary survives content edits when request omits summary`() {
        val resolved =
            PostSummaryResolver.resolveForModify(
                title = "제목",
                content = "완전히 바뀐 본문입니다.",
                submittedSummary = null,
                existingText = "작성자가 확정한 요약",
                existingSource = PostSummarySource.MANUAL,
                now = fixedNow,
            )

        assertThat(resolved.source).isEqualTo(PostSummarySource.MANUAL)
        assertThat(resolved.text).isEqualTo("작성자가 확정한 요약")
    }

    @Test
    fun `blank submitted summary clears manual mode and recomputes deterministically`() {
        val resolved =
            PostSummaryResolver.resolveForModify(
                title = "제목",
                content = "새 본문의 핵심 문장입니다. 두 번째 문장입니다.",
                submittedSummary = "   ",
                existingText = "이전 수동 요약",
                existingSource = PostSummarySource.MANUAL,
                now = fixedNow,
            )

        assertThat(resolved.source).isEqualTo(PostSummarySource.EXTRACTED)
        assertThat(resolved.text).isEqualTo("새 본문의 핵심 문장입니다. 두 번째 문장입니다.")
    }

    @Test
    fun `ellipsis is included inside the 150 grapheme limit without splitting zwj emoji`() {
        val content = "👩‍💻".repeat(80) + " 긴 기술 설명 문장입니다."

        val resolved = PostSummaryResolver.resolveForCreate("제목", content, null, fixedNow)

        assertThat(graphemeCount(resolved.text)).isLessThanOrEqualTo(PostSummaryResolver.MAX_GRAPHEMES)
        assertThat(resolved.text).endsWith("…")
        assertThat(resolved.text.dropLast(1)).endsWith("👩‍💻")
    }

    @Test
    fun `unclosed fenced code is excluded through end of document`() {
        val content =
            """
            도입 핵심 문장입니다.

            ```kotlin
            println("뒤의 코드는 요약에 포함되지 않습니다")
            """.trimIndent()

        val resolved = PostSummaryResolver.resolveForCreate("제목", content, null, fixedNow)

        assertThat(resolved.text).isEqualTo("도입 핵심 문장입니다.")
        assertThat(resolved.text).doesNotContain("println")
    }

    private fun graphemeCount(value: String): Int {
        val iterator = BreakIterator.getCharacterInstance(Locale.ROOT)
        iterator.setText(value)
        var count = 0
        iterator.first()
        while (iterator.next() != BreakIterator.DONE) count += 1
        return count
    }
}
