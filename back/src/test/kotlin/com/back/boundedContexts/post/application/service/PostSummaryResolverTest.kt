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
            PostSummaryResolver.resolveManual(
                content = fixture.content,
                submittedSummary = requireNotNull(fixture.request).summary!!,
            )

        assertThat(resolved.source.name).isEqualTo(expected.source)
        assertThat(resolved.text).isEqualTo(expected.summary)
        assertThat(resolved.algorithmVersion).isEqualTo(expected.algorithmVersion)
        assertThat(resolved.generatedAt).isNull()
    }

    @Test
    fun `new automatic writes ignore legacy frontmatter summary`() {
        val content = """---
summary: "이전 frontmatter 요약"
---
신규 본문의 핵심 문장입니다."""

        val resolved = PostSummaryResolver.resolveAutomatic("신규 글", content, fixedNow)

        assertThat(resolved.source).isEqualTo(PostSummarySource.EXTRACTED)
        assertThat(resolved.text).isEqualTo("신규 본문의 핵심 문장입니다.")
    }

    @Test
    fun `leading explicit summary block wins over ordinary prose`() {
        val fixture = resolvedFixture("leading-block", "create")
        val expected = requireNotNull(fixture.expected)

        val resolved = PostSummaryResolver.resolveAutomatic(fixture.title, fixture.content, fixedNow)

        assertThat(resolved.source.name).isEqualTo(expected.source)
        assertThat(resolved.text).isEqualTo(expected.summary)
        assertThat(resolved.algorithmVersion).isEqualTo(expected.algorithmVersion)
    }

    @Test
    fun `extractor skips title code image table and uses first two complete sentences`() {
        val fixture = resolvedFixture("extracted-with-exclusions", "create")
        val expected = requireNotNull(fixture.expected)

        val resolved = PostSummaryResolver.resolveAutomatic(fixture.title, fixture.content, fixedNow)

        assertThat(resolved.source.name).isEqualTo(expected.source)
        assertThat(resolved.text).isEqualTo(expected.summary)
        assertThat(resolved.algorithmVersion).isEqualTo(expected.algorithmVersion)
        assertThat(resolved.text).doesNotContain("raw code", "diagram", "cache")
    }

    @Test
    fun `code image and html only content resolves to none without raw markdown fallback`() {
        val fixture = resolvedFixture("none-no-fallback", "create")
        val expected = requireNotNull(fixture.expected)

        val resolved = PostSummaryResolver.resolveAutomatic(fixture.title, fixture.content, fixedNow)

        assertThat(resolved.source.name).isEqualTo(expected.source)
        assertThat(resolved.text).isEqualTo(expected.summary)
        assertThat(resolved.algorithmVersion).isEqualTo(expected.algorithmVersion)
    }

    @Test
    fun `technical punctuation and link labels are preserved`() {
        val content =
            "[HTTP 캐시 정책](https://example.com/cache)은 stale-if-error, Cache-Control, --dry-run을 함께 설명하는 충분히 긴 문장입니다."

        val resolved = PostSummaryResolver.resolveAutomatic("캐시", content, fixedNow)

        assertThat(resolved.text).contains("HTTP 캐시 정책")
        assertThat(resolved.text).contains("stale-if-error", "Cache-Control", "--dry-run")
        assertThat(resolved.text).doesNotContain("https://")
    }

    @Test
    fun `ellipsis is included inside the 150 grapheme limit without splitting zwj emoji`() {
        val fixture = resolvedFixture("unicode-grapheme", "create")
        val expected = requireNotNull(fixture.expected)

        val resolved = PostSummaryResolver.resolveAutomatic(fixture.title, fixture.content, fixedNow)

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

        val resolved = PostSummaryResolver.resolveAutomatic("제목", content, fixedNow)

        assertThat(resolved.text).isEqualTo("도입 핵심 문장입니다.")
        assertThat(resolved.text).doesNotContain("println")
    }

    @Test
    fun `manual summary longer than the limit keeps the ellipsis inside 150 graphemes`() {
        val resolved =
            PostSummaryResolver.resolveManual(
                content = "본문",
                submittedSummary = "가".repeat(200),
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
                ThrowingSupplier { PostSummaryResolver.resolveAutomatic("링크", content, fixedNow) },
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

        val resolved = PostSummaryResolver.resolveAutomatic("제목", content, fixedNow)

        assertThat(resolved.source).isEqualTo(PostSummarySource.NONE)
        assertThat(resolved.text).isEmpty()
        assertThat(resolved.algorithmVersion).isEqualTo(PostSummaryResolver.ALGORITHM_VERSION)
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

        val resolved = PostSummaryResolver.resolveAutomatic("수식", content, fixedNow)

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

        val resolved = PostSummaryResolver.resolveAutomatic("HTML", content, fixedNow)

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

        val resolved = PostSummaryResolver.resolveAutomatic("인덴트", content, fixedNow)

        assertThat(resolved.text).isEqualTo("인덴트 코드 뒤의 첫 번째 핵심 문장입니다. 두 번째 문장입니다.")
        assertThat(resolved.text).doesNotContain("indented")
    }

    @Test
    fun `crlf and cr line endings normalize to identical hash and summary as lf`() {
        val lfContent = "---\ntitle: 테스트\n---\n\n첫 번째 핵심 문장입니다.\n두 번째 핵심 문장입니다."
        val crlfContent = "---\r\ntitle: 테스트\r\n---\r\n\r\n첫 번째 핵심 문장입니다.\r\n두 번째 핵심 문장입니다."
        val crContent = "---\rtitle: 테스트\r---\r\r첫 번째 핵심 문장입니다.\r두 번째 핵심 문장입니다."

        val lfResolved = PostSummaryResolver.resolveAutomatic("제목", lfContent)
        val crlfResolved = PostSummaryResolver.resolveAutomatic("제목", crlfContent, fixedNow)
        val crResolved = PostSummaryResolver.resolveAutomatic("제목", crContent, fixedNow)

        assertThat(crlfResolved.contentHash).isEqualTo(lfResolved.contentHash)
        assertThat(crResolved.contentHash).isEqualTo(lfResolved.contentHash)
        assertThat(crlfResolved.text).isEqualTo(lfResolved.text)
        assertThat(crResolved.text).isEqualTo(lfResolved.text)
        assertThat(lfResolved.generatedAt).isNotNull()
    }

    @Test
    fun `inline markdown guards strip inline image reference link code footnote and html tags`() {
        val content =
            """
            ---
            title: 인라인 마크다운 정리
            ---
            ~~~~
            ```
            ~~~
            ~~~~

            <!-- 주석 -->
            <br/>
            <section>
            블록 내부

            > 일반 인용문입니다.
            - 목록 항목입니다.
            ${'\t'}탭 인덴트 코드입니다.

            안녕하세요!

            짧은글

            인라인 ![아이콘](https://example.com/icon.png "아이콘") 이미지와 [문서](https://example.com) 및 [참조링크][id1], `코드조각`, 각주[^1], <span>태그</span>, **굵게** __강조__ ~~취소~~ 표현을 모두 정리하는 문장입니다.
            """.trimIndent()

        val resolved = PostSummaryResolver.resolveAutomatic("인라인 마크다운 정리", content, fixedNow)

        assertThat(resolved.source).isEqualTo(PostSummarySource.EXTRACTED)
        assertThat(resolved.text).isEqualTo(
            "인라인 이미지와 문서 및 참조링크, 코드조각, 각주 , 태그 , 굵게 강조 취소 표현을 모두 정리하는 문장입니다.",
        )
    }

    @Test
    fun `frontmatter edge cases with unclosed or empty body resolve deterministically`() {
        val dashOnly = "---"
        val dashPrefixNotDelimiter = "---not-frontmatter\n핵심 본문 문장입니다. 충분히 긴 두 번째 문장입니다."
        val unclosedFrontmatter = "---\ntitle: 미종료\n핵심 본문 문장입니다. 충분히 긴 두 번째 문장입니다."
        val emptyBodyAfterFrontmatter = "---\ntitle: 빈본문\n---"

        assertThat(PostSummaryResolver.resolveAutomatic("제목", dashOnly, fixedNow).source)
            .isEqualTo(PostSummarySource.NONE)
        assertThat(PostSummaryResolver.resolveAutomatic("제목", dashPrefixNotDelimiter, fixedNow).text)
            .contains("핵심 본문 문장입니다.")
        assertThat(PostSummaryResolver.resolveAutomatic("제목", unclosedFrontmatter, fixedNow).text)
            .contains("핵심 본문 문장입니다.")
        assertThat(PostSummaryResolver.resolveAutomatic("제목", emptyBodyAfterFrontmatter, fixedNow).source)
            .isEqualTo(PostSummarySource.NONE)
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
