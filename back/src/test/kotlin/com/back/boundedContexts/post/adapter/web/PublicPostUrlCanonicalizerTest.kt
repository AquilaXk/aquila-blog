package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.global.app.AppConfig
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant

class PublicPostUrlCanonicalizerTest {
    @BeforeEach
    fun setUp() {
        AppConfig("https://api.new-aquilaxk.site", "https://www.aquilaxk.site")
    }

    @Test
    fun `공개 feed와 detail의 retired storage URL만 canonicalize한다`() {
        val feed =
            feedPost(
                authorProfileImgUrl = "https://api.aquilaxk.site/post/api/v1/images/profile%20image.png",
                thumbnail = "https://api.aquilaxk.site/post/api/v1/images/thumbnail.png?version=1#preview",
            )
        val detail =
            PostWithContentDto(
                id = 1L,
                createdAt = Instant.EPOCH,
                modifiedAt = Instant.EPOCH,
                authorId = 2L,
                authorName = "author",
                authorUsername = "author",
                authorProfileImageUrl = "https://current.example.com/member/api/v1/profile/2",
                authorProfileImageDirectUrl = "https://api.aquilaxk.site/post/api/v1/images/profile.png",
                title = "title",
                content = "![image](https://api.aquilaxk.site/post/api/v1/images/folder%2Fimage.png?version=1#preview)",
                contentHtml = "<img src=\"https://api.aquilaxk.site/post/api/v1/files/file.pdf\">",
                version = 1L,
                published = true,
                listed = true,
                likesCount = 0,
                commentsCount = 0,
                hitCount = 0,
            )

        assertThat(PublicPostUrlCanonicalizer.canonicalizeFeedPost(feed).thumbnail)
            .isEqualTo("https://api.new-aquilaxk.site/post/api/v1/images/thumbnail.png?version=1#preview")
        val canonicalDetail = PublicPostUrlCanonicalizer.canonicalizePostWithContent(detail)
        assertThat(canonicalDetail.authorProfileImageUrl).isEqualTo(detail.authorProfileImageUrl)
        assertThat(canonicalDetail.authorProfileImageDirectUrl)
            .isEqualTo("https://api.new-aquilaxk.site/post/api/v1/images/profile.png")
        assertThat(canonicalDetail.content)
            .contains(
                "https://api.new-aquilaxk.site/post/api/v1/images/folder%2Fimage.png?version=1#preview",
            )
        assertThat(canonicalDetail.contentHtml).contains("https://api.new-aquilaxk.site/post/api/v1/files/file.pdf")
    }

    private fun feedPost(
        authorProfileImgUrl: String,
        thumbnail: String?,
    ): FeedPostDto =
        FeedPostDto(
            id = 1L,
            createdAt = Instant.EPOCH,
            modifiedAt = Instant.EPOCH,
            authorId = 2L,
            authorName = "author",
            authorUsername = "author",
            authorProfileImgUrl = authorProfileImgUrl,
            title = "title",
            thumbnail = thumbnail,
            summary = "summary",
            tags = emptyList(),
            category = emptyList(),
            published = true,
            listed = true,
            likesCount = 0,
            commentsCount = 0,
            hitCount = 0,
        )
}
