package com.back.boundedContexts.post.dto

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.global.app.AppConfig
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.time.Instant

@DisplayName("게시글 작성자 DTO 매핑")
class PostAuthorDtoMappingTest {
    companion object {
        @JvmStatic
        @BeforeAll
        fun initAppConfig() {
            AppConfig(
                siteBackUrl = "https://api.example.com",
                siteFrontUrl = "https://example.com",
            )
        }
    }

    @Test
    @DisplayName("feed DTO는 작성자의 nickname과 username을 별도 필드에 매핑한다")
    fun mapsFeedAuthorNameAndUsernameSeparately() {
        val post = postByAuthor(username = "aquila-login", nickname = "아퀼라")

        val dto = FeedPostDto.from(post)

        assertThat(dto.authorName).isEqualTo("아퀼라")
        assertThat(dto.authorUsername).isEqualTo("aquila-login")
    }

    @Test
    @DisplayName("detail DTO는 작성자의 nickname과 username을 별도 필드에 매핑한다")
    fun mapsDetailAuthorNameAndUsernameSeparately() {
        val post = postByAuthor(username = "aquila-login", nickname = "아퀼라")

        val dto = PostWithContentDto(post)

        assertThat(dto.authorName).isEqualTo("아퀼라")
        assertThat(dto.authorUsername).isEqualTo("aquila-login")
    }

    private fun postByAuthor(
        username: String,
        nickname: String,
    ): Post {
        val author =
            Member(
                id = 1L,
                username = username,
                password = null,
                nickname = nickname,
                email = null,
            ).apply {
                createdAt = Instant.parse("2026-01-01T00:00:00Z")
                modifiedAt = Instant.parse("2026-01-01T00:01:00Z")
            }
        return Post(
            id = 10L,
            author = author,
            title = "작성자 매핑",
            content = "본문",
            published = true,
            listed = true,
        ).apply {
            createdAt = Instant.parse("2026-01-02T00:00:00Z")
            modifiedAt = Instant.parse("2026-01-02T00:01:00Z")
        }
    }
}
