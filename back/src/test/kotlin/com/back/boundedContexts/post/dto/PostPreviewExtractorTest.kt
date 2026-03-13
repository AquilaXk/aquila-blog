package com.back.boundedContexts.post.dto

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

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
}
