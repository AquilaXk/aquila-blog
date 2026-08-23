package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.CanonicalSummaryFixture
import com.back.boundedContexts.post.model.PostSummarySource
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertTimeoutPreemptively
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.function.ThrowingSupplier
import java.text.BreakIterator
import java.time.Duration
import java.time.Instant
import java.util.Locale

@org.junit.jupiter.api.DisplayName("PostSummaryResolver 테스트")
class PostSummaryResolverTest {
    private val fixedNow = Instant.parse("2026-08-01T00:00:00Z")

    @Test
    fun `manual summary wins without rewriting author wording`() {
        val fixture = resolvedFixture("manual-create", "create")
        val expected = requireNotNull(fixture.expected)
        val resolved =
            PostSummaryResolver.resolveForCreate(
                title = fixture.title,
                content = fixture.content,
                submittedSummary = fixture.request.summary,
                now = fixedNow,
            )

        assertThat(resolved.source.name).isEqualTo(expected.source)
        assertThat(resolved.text).isEqualTo(expected.summary)
        assertThat(resolved.algorithmVersion).isEqualTo(expected.algorithmVersion)
        assertThat(resolved.generatedAt).isNull()
    }

    @Test
    fun `legacy frontmatter summary is migrated with CRLF and escaped quotes`() {
        val fixture = resolvedFixture("migrated-frontmatter", "backfill")
        val expected = requireNotNull(fixture.expected)

        val resolved = PostSummaryResolver.resolveForBackfill(fixture.title, fixture.content, fixedNow)

        assertThat(resolved.source.name).isEqualTo(expected.source)
        assertThat(resolved.text).isEqualTo(expected.summary)
        assertThat(resolved.algorithmVersion).isEqualTo(expected.algorithmVersion)
    }

    @Test
    fun `new automatic writes ignore legacy frontmatter summary`() {
        val content = """---
summary: "이전 frontmatter 요약"
---
신규 본문의 핵심 문장입니다."""

        val resolved = PostSummaryResolver.resolveForCreate("신규 글", content, null, fixedNow)

        assertThat(resolved.source).isEqualTo(PostSummarySource.EXTRACTED)
        assertThat(resolved.text).isEqualTo("신규 본문의 핵심 문장입니다.")
    }

    @Test
    fun `leading explicit summary block wins over ordinary prose`() {
        val fixture = resolvedFixture("leading-block", "create")
        val expected = requireNotNull(fixture.expected)

        val resolved = PostSummaryResolver.resolveForCreate(fixture.title, fixture.content, fixture.request.summary, fixedNow)

        assertThat(resolved.source.name).isEqualTo(expected.source)
        assertThat(resolved.text).isEqualTo(expected.summary)
        assertThat(resolved.algorithmVersion).isEqualTo(expected.algorithmVersion)
    }

    @Test
    fun `extractor skips title code image table and uses first two complete sentences`() {
        val fixture = resolvedFixture("extracted-with-exclusions", "create")
        val expected = requireNotNull(fixture.expected)

        val resolved = PostSummaryResolver.resolveForCreate(fixture.title, fixture.content, fixture.request.summary, fixedNow)

        assertThat(resolved.source.name).isEqualTo(expected.source)
        assertThat(resolved.text).isEqualTo(expected.summary)
        assertThat(resolved.algorithmVersion).isEqualTo(expected.algorithmVersion)
        assertThat(resolved.text).doesNotContain("raw code", "diagram", "cache")
    }

    @Test
    fun `code image and html only content resolves to none without raw markdown fallback`() {
        val fixture = resolvedFixture("none-no-fallback", "create")
        val expected = requireNotNull(fixture.expected)

        val resolved = PostSummaryResolver.resolveForCreate(fixture.title, fixture.content, fixture.request.summary, fixedNow)

        assertThat(resolved.source.name).isEqualTo(expected.source)
        assertThat(resolved.text).isEqualTo(expected.summary)
        assertThat(resolved.algorithmVersion).isEqualTo(expected.algorithmVersion)
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
        val fixture = resolvedFixture("manual-preserve-omitted", "modify")
        val existing = requireNotNull(fixture.existing)
        val expected = requireNotNull(fixture.expected)
        val resolved =
            PostSummaryResolver.resolveForModify(
                title = fixture.title,
                content = fixture.content,
                submittedSummary = fixture.request.summary,
                existingText = existing.summary,
                existingSource = PostSummarySource.valueOf(existing.source),
                now = fixedNow,
            )

        assertThat(resolved.source.name).isEqualTo(expected.source)
        assertThat(resolved.text).isEqualTo(expected.summary)
        assertThat(resolved.algorithmVersion).isEqualTo(expected.algorithmVersion)
    }

    @Test
    fun `blank submitted summary clears manual mode and recomputes deterministically`() {
        val fixture = resolvedFixture("blank-recompute", "modify")
        val existing = requireNotNull(fixture.existing)
        val expected = requireNotNull(fixture.expected)
        val resolved =
            PostSummaryResolver.resolveForModify(
                title = fixture.title,
                content = fixture.content,
                submittedSummary = fixture.request.summary,
                existingText = existing.summary,
                existingSource = PostSummarySource.valueOf(existing.source),
                now = fixedNow,
            )

        assertThat(resolved.source.name).isEqualTo(expected.source)
        assertThat(resolved.text).isEqualTo(expected.summary)
        assertThat(resolved.algorithmVersion).isEqualTo(expected.algorithmVersion)
    }

    @Test
    fun `ellipsis is included inside the 150 grapheme limit without splitting zwj emoji`() {
        val fixture = resolvedFixture("unicode-grapheme", "create")
        val expected = requireNotNull(fixture.expected)

        val resolved = PostSummaryResolver.resolveForCreate(fixture.title, fixture.content, fixture.request.summary, fixedNow)

        assertThat(resolved.source.name).isEqualTo(expected.source)
        assertThat(resolved.text).isEqualTo(expected.summary)
        assertThat(resolved.algorithmVersion).isEqualTo(expected.algorithmVersion)
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

    @Test
    fun `manual summary longer than the limit keeps the ellipsis inside 150 graphemes`() {
        val resolved =
            PostSummaryResolver.resolveForCreate(
                title = "제목",
                content = "본문",
                submittedSummary = "가".repeat(200),
                now = fixedNow,
            )

        assertThat(graphemeCount(resolved.text)).isEqualTo(PostSummaryResolver.MAX_GRAPHEMES)
        assertThat(resolved.text).endsWith("…")
    }

    @Test
    fun `unclosed link parenthesis is cleaned in linear time`() {
        val content = "[문서](" + "a".repeat(40) + " 닫는 괄호가 없는 링크 문장입니다."

        val resolved =
            assertTimeoutPreemptively(
                Duration.ofSeconds(2),
                ThrowingSupplier { PostSummaryResolver.resolveForCreate("링크", content, null, fixedNow) },
            )

        assertThat(resolved.source).isEqualTo(PostSummarySource.EXTRACTED)
        assertThat(resolved.text).isEqualTo(content)
    }

    @Test
    fun `placeholder wording is never adopted as a summary`() {
        val content =
            """
            > **요약:** 요약을 생성할 수 없습니다.

            ![only image](https://example.com/image.png)
            """.trimIndent()

        val resolved = PostSummaryResolver.resolveForCreate("제목", content, null, fixedNow)

        assertThat(resolved.source).isEqualTo(PostSummarySource.NONE)
        assertThat(resolved.text).isEmpty()
        assertThat(resolved.algorithmVersion).isEqualTo(PostSummaryResolver.ALGORITHM_VERSION)
    }

    @Test
    fun `single quoted legacy frontmatter summary is unescaped during backfill`() {
        val content =
            """---
summary: 'It''s 캐시 정책 요약입니다.'
---
본문입니다."""

        val resolved = PostSummaryResolver.resolveForBackfill("캐시", content, fixedNow)

        assertThat(resolved.source).isEqualTo(PostSummarySource.MIGRATED)
        assertThat(resolved.text).isEqualTo("It's 캐시 정책 요약입니다.")
    }

    @Test
    fun `escaped backslash and line break in legacy frontmatter summary are decoded`() {
        val content =
            """---
summary: "경로 C:\\temp 안내\n다음 문장입니다."
---
본문입니다."""

        val resolved = PostSummaryResolver.resolveForBackfill("경로", content, fixedNow)

        assertThat(resolved.source).isEqualTo(PostSummarySource.MIGRATED)
        assertThat(resolved.text).isEqualTo("""경로 C:\temp 안내 다음 문장입니다.""")
    }

    @Test
    fun `display math block is excluded from summary candidates`() {
        val mathFence = "${'$'}${'$'}"
        val content =
            """
            |$mathFence
            |E = mc^2
            |$mathFence
            |
            |수식 뒤의 첫 번째 핵심 문장입니다. 두 번째 문장입니다.
            """.trimMargin()

        val resolved = PostSummaryResolver.resolveForCreate("수식", content, null, fixedNow)

        assertThat(resolved.text).isEqualTo("수식 뒤의 첫 번째 핵심 문장입니다. 두 번째 문장입니다.")
        assertThat(resolved.text).doesNotContain("mc^2")
    }

    @Test
    fun `multi line html block is excluded until its closing tag`() {
        val content =
            """
            <div class="callout">
            HTML 블록 안의 문장입니다.
            </div>

            HTML 뒤의 첫 번째 핵심 문장입니다. 두 번째 문장입니다.
            """.trimIndent()

        val resolved = PostSummaryResolver.resolveForCreate("HTML", content, null, fixedNow)

        assertThat(resolved.text).isEqualTo("HTML 뒤의 첫 번째 핵심 문장입니다. 두 번째 문장입니다.")
        assertThat(resolved.text).doesNotContain("HTML 블록 안의")
    }

    @Test
    fun `indented code block is excluded from summary candidates`() {
        val content =
            """
            |# 인덴트
            |
            |    val indented = "인덴트 코드 블록의 내용입니다."
            |
            |인덴트 코드 뒤의 첫 번째 핵심 문장입니다. 두 번째 문장입니다.
            """.trimMargin()

        val resolved = PostSummaryResolver.resolveForCreate("인덴트", content, null, fixedNow)

        assertThat(resolved.text).isEqualTo("인덴트 코드 뒤의 첫 번째 핵심 문장입니다. 두 번째 문장입니다.")
        assertThat(resolved.text).doesNotContain("indented")
    }

    private fun graphemeCount(value: String): Int {
        val iterator = BreakIterator.getCharacterInstance(Locale.ROOT)
        iterator.setText(value)
        var count = 0
        iterator.first()
        while (iterator.next() != BreakIterator.DONE) count += 1
        return count
    }

    private fun resolvedFixture(
        id: String,
        resolve: String,
    ): CanonicalSummaryFixture.Fixture =
        CanonicalSummaryFixture.fixture(id).also {
            assertThat(it.resolve).isEqualTo(resolve)
            assertThat(it.outcome).isEqualTo("RESOLVED")
        }
}
