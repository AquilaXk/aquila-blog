package com.back.boundedContexts.post.application.service

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("PostWikilinkScanner 단위 테스트")
class PostWikilinkScannerTest {
    @Test
    @DisplayName("제목/별칭/헤딩/숫자 위키링크와 /posts/{id} 마크다운 링크를 매칭한다")
    fun matchesWikilinksAndPostPathLinks() {
        val targetTitle = "Spring   Boot  캐시 설계"
        val normalized = PostWikilinkScanner.normalizeTargetKey(targetTitle)

        assertThat(normalized).isEqualTo("spring boot 캐시 설계")
        assertThat(PostWikilinkScanner.referencesTargetPost("참고: [[Spring Boot 캐시 설계]]", 42L, normalized)).isTrue()
        assertThat(PostWikilinkScanner.referencesTargetPost("참고: [[  spring   BOOT 캐시 설계#아키텍처|자세히 ]]", 42L, normalized)).isTrue()
        assertThat(PostWikilinkScanner.referencesTargetPost("ID 참조 [[42]] 및 [[42#summary|42번 글]]", 42L, normalized)).isTrue()
        assertThat(PostWikilinkScanner.referencesTargetPost("상대 경로 [링크](/posts/42#section)", 42L, normalized)).isTrue()
        assertThat(PostWikilinkScanner.referencesTargetPost("전체 URL [링크](https://aquila.blog/posts/42?ref=1)", 42L, normalized)).isTrue()
    }

    @Test
    @DisplayName("코드 블록·인라인 코드·이스케이프·부분 일치·타 경로 접두사는 백링크로 인정하지 않는다")
    fun rejectsCodeAndFalsePositiveLinks() {
        val normalized = PostWikilinkScanner.normalizeTargetKey("Architecture Guide")

        assertThat(
            PostWikilinkScanner.referencesTargetPost(
                """
                ```markdown
                [[Architecture Guide]]
                [link](/posts/42)
                ```
                ~~~
                [[42]]
                ~~~
                인라인 `[[Architecture Guide]]` 와 `[/posts/42](/posts/42)`
                이스케이프 \[[Architecture Guide]] 및 [[Architecture Guide\]]
                부분 일치 [[Architecture Guide v2]]
                부분 숫자 [other](/posts/420)
                접두사 불일치 [x](a/posts/42) [y](api/posts/42) [z](//posts/42)
                앵커/외부 [[#heading]] [[/posts/42]] [[https://example.com]]
                """.trimIndent(),
                42L,
                normalized,
            ),
        ).isFalse()
    }

    @Test
    @DisplayName("128KB 스캔 상한을 초과한 위치의 링크는 무시하고 OOM/장시간 스캔을 방지한다")
    fun enforcesMaxScanBytesBound() {
        val oversized = "a".repeat(128 * 1024 + 64) + "\n[[Target Post]]\n[link](/posts/7)\n"

        assertThat(
            PostWikilinkScanner.referencesTargetPost(
                markdown = oversized,
                targetPostId = 7L,
                normalizedTargetTitle = PostWikilinkScanner.normalizeTargetKey("Target Post"),
            ),
        ).isFalse()
        assertThat(PostWikilinkScanner.referencesTargetPost("[[Target Post]]", 0L, "target post")).isFalse()
        assertThat(PostWikilinkScanner.referencesTargetPost("", 7L, "target post")).isFalse()
    }

    @Test
    @DisplayName("1~3칸 들여쓴 닫는 코드 펜스를 닫아 이후 위키링크를 누락하지 않고, 긴 도메인과 하위 경로 위양성을 정확히 구분한다")
    fun handlesIndentedClosingFenceAndLongHostBoundary() {
        val normalized = PostWikilinkScanner.normalizeTargetKey("Architecture Guide")

        val afterIndentedFence =
            """
            ```kotlin
            val ignored = "[[Architecture Guide]]"
              ```
            복구 후 링크 [[Architecture Guide]]
            """.trimIndent()
        assertThat(PostWikilinkScanner.referencesTargetPost(afterIndentedFence, 42L, normalized)).isTrue()

        val afterIndentedTildeFence =
            """
              ~~~text
              [ignored](/posts/42)
               ~~~
            복구 후 경로 [ok](/posts/42)
            """.trimIndent()
        assertThat(PostWikilinkScanner.referencesTargetPost(afterIndentedTildeFence, 42L, normalized)).isTrue()

        val longHostUrl = "참고: [긴 호스트](https://very-long-subdomain-1234567890-abcdef.engineering-platform.example.com/posts/42)"
        assertThat(PostWikilinkScanner.referencesTargetPost(longHostUrl, 42L, normalized)).isTrue()

        val nestedSubpathUrl = "오탐 방지: [서브패스](https://aquila.blog/blog/archive/posts/42)"
        assertThat(PostWikilinkScanner.referencesTargetPost(nestedSubpathUrl, 42L, normalized)).isFalse()

        val multiBacktickNestedSingle = "``code ` inner`` [[42]]"
        assertThat(PostWikilinkScanner.referencesTargetPost(multiBacktickNestedSingle, 42L, normalized)).isTrue()

        val unclosedWikilinkEof = "미완성 [[42 닫히지않음"
        assertThat(PostWikilinkScanner.referencesTargetPost(unclosedWikilinkEof, 42L, normalized)).isFalse()

        val schemelessHostPath = "example.com/posts/42"
        assertThat(PostWikilinkScanner.referencesTargetPost(schemelessHostPath, 42L, normalized)).isFalse()
    }

    @Test
    @DisplayName("인라인 백틱·중첩 대괄호·이스케이프·빈 별칭·서브패스·오토링크 경계를 프론트엔드 스캐너와 동일하게 처리한다")
    fun enforcesFrontendScannerParityAndPathBoundaries() {
        val normalized = PostWikilinkScanner.normalizeTargetKey("Architecture Guide")

        // CommonMark: backtick opening fence info strings cannot contain backticks (`inline` at col 0 is not a fence).
        assertThat(PostWikilinkScanner.referencesTargetPost("```inline `span`\n[[Architecture Guide]]", 42L, normalized)).isTrue()
        // Tilde fences MAY contain backticks in info strings.
        assertThat(PostWikilinkScanner.referencesTargetPost("~~~ ```info\n[[Architecture Guide]]\n~~~", 42L, normalized)).isFalse()

        // Unclosed outer bracket / single closing bracket stops early so inner valid wikilink still matches.
        assertThat(PostWikilinkScanner.referencesTargetPost("미완성 [[broken [중간 [[42]]", 42L, normalized)).isTrue()
        assertThat(PostWikilinkScanner.referencesTargetPost("단일 닫힘 [[Architecture] Guide]]", 42L, normalized)).isFalse()

        // Escaped pipe / backslash target / empty alias parity with frontend findWikilinkSpans.
        assertThat(PostWikilinkScanner.referencesTargetPost("[[Architecture Guide\\|요약]]", 42L, normalized)).isTrue()
        assertThat(PostWikilinkScanner.referencesTargetPost("[[Architecture\\Guide|요약]]", 42L, normalized)).isFalse()
        assertThat(PostWikilinkScanner.referencesTargetPost("[[Architecture Guide|]]", 42L, normalized)).isFalse()
        assertThat(PostWikilinkScanner.referencesTargetPost("[[|Alias]]", 42L, normalized)).isFalse()

        // Canonical trailing slash & GFM autolink boundaries pass; nested subpath /edit fails closed.
        assertThat(PostWikilinkScanner.referencesTargetPost("<https://aquila.blog/posts/42>", 42L, normalized)).isTrue()
        assertThat(PostWikilinkScanner.referencesTargetPost("[slash](/posts/42/)", 42L, normalized)).isTrue()
        assertThat(PostWikilinkScanner.referencesTargetPost("[end](/posts/42/", 42L, normalized)).isTrue()
        assertThat(PostWikilinkScanner.referencesTargetPost("[edit](/posts/42/edit)", 42L, normalized)).isFalse()
    }
}
