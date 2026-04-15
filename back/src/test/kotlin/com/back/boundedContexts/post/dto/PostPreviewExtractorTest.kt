package com.back.boundedContexts.post.dto

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

@org.junit.jupiter.api.DisplayName("PostPreviewExtractor 테스트")
class PostPreviewExtractorTest {
    @Test
    fun `extractThumbnail returns first markdown image url`() {
        val content =
            """
            # 제목
            
            ![썸네일](https://example.com/cover.png)
            
            본문입니다.
            """.trimIndent()

        val thumbnail = PostPreviewExtractor.extractThumbnail(content)

        assertThat(thumbnail).isEqualTo("https://example.com/cover.png")
    }

    @Test
    fun `makeSummary removes markdown image alt text from summary`() {
        val content =
            """
            # 테스트글
            
            ![테스트 이미지 입니다](https://example.com/cover.png)
            
            도입부 IoC(Inversion of Control)는 객체의 생성과 생명주기 관리 주도권을 프레임워크에 넘기는 설계 원칙이다.
            """.trimIndent()

        val summary = PostPreviewExtractor.makeSummary(content)

        assertThat(summary).doesNotContain("테스트 이미지 입니다")
        assertThat(summary).contains("도입부 IoC(Inversion of Control)")
    }

    @Test
    fun `makeSummary ignores persisted fallback summary metadata and rebuilds from body`() {
        val content =
            """
            ---
            summary: "요약을 생성할 수 없습니다."
            ---

            Stateless는 서버가 요청 사이 사용자 상태를 저장하지 않고, 요청 자체만으로 인증·인가 판단에 필요한 정보를 처리하는 방식이다.
            """.trimIndent()

        val summary = PostPreviewExtractor.makeSummary(content)

        assertThat(summary).isNotEqualTo("요약을 생성할 수 없습니다.")
        assertThat(summary).contains("Stateless는 서버가 요청 사이 사용자 상태를 저장하지 않고")
    }
}
