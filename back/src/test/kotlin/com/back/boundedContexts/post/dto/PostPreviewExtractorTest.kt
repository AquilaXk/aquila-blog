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
    fun `frontmatter thumbnail remains authoritative when summary metadata is present`() {
        val content =
            """
            ---
            summary: "저장된 요약"
            thumbnail: "https://example.com/metadata.png"
            ---

            ![본문 이미지](https://example.com/body.png)
            """.trimIndent()

        assertThat(PostPreviewExtractor.extractThumbnail(content))
            .isEqualTo("https://example.com/metadata.png")
    }

    @Test
    fun `same hash and length contents never share a thumbnail`() {
        val first = "![cover](https://example.com/FB.png)"
        val second = "![cover](https://example.com/Ea.png)"

        assertThat(first).hasSameSizeAs(second)
        assertThat(first.hashCode()).isEqualTo(second.hashCode())

        assertThat(PostPreviewExtractor.extractThumbnail(first)).isEqualTo("https://example.com/FB.png")
        assertThat(PostPreviewExtractor.extractThumbnail(second)).isEqualTo("https://example.com/Ea.png")
    }
}
