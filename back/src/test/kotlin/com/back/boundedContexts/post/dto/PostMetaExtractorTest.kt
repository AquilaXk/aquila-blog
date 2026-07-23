package com.back.boundedContexts.post.dto

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

@org.junit.jupiter.api.DisplayName("PostMetaExtractor 테스트")
class PostMetaExtractorTest {
    @Test
    fun `front matter 에서 tags 와 categories 를 추출한다`() {
        val content =
            """
            ---
            tags: [성능, 피드]
            categories: [백엔드]
            ---
            
            본문
            """.trimIndent()

        val meta = PostMetaExtractor.extract(content)

        assertThat(meta.tags).containsExactly("성능", "피드")
        assertThat(meta.categories).containsExactly("백엔드")
    }

    @Test
    fun `본문 상단 메타 라인에서도 tags 와 categories 를 추출한다`() {
        val content =
            """
            tags: 성능, 피드
            category: 백엔드
            
            본문
            """.trimIndent()

        val meta = PostMetaExtractor.extract(content)

        assertThat(meta.tags).containsExactly("성능", "피드")
        assertThat(meta.categories).containsExactly("백엔드")
    }
}
