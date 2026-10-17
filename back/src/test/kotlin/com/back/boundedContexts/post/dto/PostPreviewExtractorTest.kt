package com.back.boundedContexts.post.dto

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("PostPreviewExtractor 테스트")
class PostPreviewExtractorTest {
    @BeforeEach
    fun clearCache() {
        PostPreviewExtractor.clearCache()
    }

    @Test
    fun `extractThumbnail returns first markdown image url and reuses cache on repeat call`() {
        val content =
            """
            # 제목
            
            ![썸네일](https://example.com/cover.png "타이틀")
            
            본문입니다.
            """.trimIndent()

        val first = PostPreviewExtractor.extractThumbnail(content)
        val second = PostPreviewExtractor.extractThumbnail(content)

        assertThat(first).isEqualTo("https://example.com/cover.png")
        assertThat(second).isEqualTo("https://example.com/cover.png")
        assertThat(PostPreviewExtractor.cachedEntryCount()).isEqualTo(1)
    }

    @Test
    fun `frontmatter thumbnail remains authoritative when summary metadata is present`() {
        val content =
            """
            ---
            invalid-line-without-colon
            summary: "저장된 요약"
            thumbnail: ""
            cover_image: 'https://example.com/metadata.png'
            ---

            ![본문 이미지](https://example.com/body.png)
            """.trimIndent()

        assertThat(PostPreviewExtractor.extractThumbnail(content))
            .isEqualTo("https://example.com/metadata.png")
    }

    @Test
    fun `header scan skips non-thumbnail frontmatter and metadata lines without matching image syntax inside summary`() {
        val contentWithSummaryImage =
            """
            ---
            summary: "![요약내부이미지](https://example.com/not-a-body-image.png)"
            ---
            tags: [kotlin]

            본문 시작
            ![실제 본문 이미지](https://example.com/real-body.png)
            """.trimIndent()
        val singleLineMetadata = "thumb: https://example.com/single-line.png"

        assertThat(PostPreviewExtractor.extractThumbnail(contentWithSummaryImage))
            .isEqualTo("https://example.com/real-body.png")
        assertThat(PostPreviewExtractor.extractThumbnail(singleLineMetadata))
            .isEqualTo("https://example.com/single-line.png")
        assertThat(PostPreviewExtractor.extractThumbnail("tags: [kotlin]")).isNull()
        assertThat(PostPreviewExtractor.extractThumbnail("thumbnail: \"\"")).isNull()
    }

    @Test
    fun `contents without thumbnail cache sentinel and return null on repeat lookup`() {
        val plain = "   \n# 이미지 없는 글\n\n텍스트만 있는 본문입니다."
        val unclosedFrontmatter = "---\nthumbnail: https://example.com/unclosed.png\n본문"
        val blank = "   "

        assertThat(PostPreviewExtractor.extractThumbnail(plain)).isNull()
        assertThat(PostPreviewExtractor.extractThumbnail(plain)).isNull()
        assertThat(PostPreviewExtractor.extractThumbnail(unclosedFrontmatter)).isNull()
        assertThat(PostPreviewExtractor.extractThumbnail(blank)).isNull()
    }

    @Test
    fun `same hash and length contents never share a thumbnail and cache stays bounded by SHA-256 key`() {
        val first = "![cover](https://example.com/FB.png)"
        val second = "![cover](https://example.com/Ea.png)"

        assertThat(first).hasSameSizeAs(second)
        assertThat(first.hashCode()).isEqualTo(second.hashCode())
        assertThat(PostPreviewExtractor.cacheKeyFor(first)).hasSize(64).matches("^[0-9a-f]{64}$")

        assertThat(PostPreviewExtractor.extractThumbnail(first)).isEqualTo("https://example.com/FB.png")
        assertThat(PostPreviewExtractor.extractThumbnail(second)).isEqualTo("https://example.com/Ea.png")

        val total = PostPreviewExtractor.MAX_CACHE_ENTRIES + 16
        for (index in 1..total) {
            val extracted = PostPreviewExtractor.extractThumbnail("![img](https://example.com/img-$index.png)")
            assertThat(extracted).isEqualTo("https://example.com/img-$index.png")
        }

        assertThat(PostPreviewExtractor.cachedEntryCount())
            .isLessThanOrEqualTo(PostPreviewExtractor.MAX_CACHE_ENTRIES)
    }
}
