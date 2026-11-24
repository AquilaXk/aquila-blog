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
}
