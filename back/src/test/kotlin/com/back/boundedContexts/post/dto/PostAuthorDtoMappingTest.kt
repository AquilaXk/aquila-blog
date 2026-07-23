package com.back.boundedContexts.post.dto

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.global.app.AppConfig
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
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
    @DisplayName("feed DTO는 authorUsername에 login_id 대신 nickname을 마스킹한다")
    fun mapsFeedAuthorUsernameToNicknameMask() {
        val post = postByAuthor(username = "aquila-login", nickname = "아퀼라")

        val dto = FeedPostDto.from(post)

        assertThat(dto.authorName).isEqualTo("아퀼라")
        assertThat(dto.authorUsername).isEqualTo("아퀼라")
    }

    @Test
    @DisplayName("feed DTO는 핵심 필드 매핑 실패를 가짜 행으로 변환하지 않는다")
    fun doesNotCreateDummyFeedRowWhenCoreMappingFails() {
        val post = postByAuthor(username = "aquila-login", nickname = "아퀼라")
        val uninitializedPost =
            Post(
                id = post.id,
                author = post.author,
                title = post.title,
                content = post.content,
                published = post.published,
                listed = post.listed,
            )

        assertThatThrownBy { FeedPostDto.from(uninitializedPost) }
            .isInstanceOf(UninitializedPropertyAccessException::class.java)
    }

    @Test
    @DisplayName("feed DTO는 미리보기와 메타데이터 실패만 보조 필드로 제한한다")
    fun keepsPreviewAndMetaFailuresInAuxiliaryFields() {
        val post = postByAuthor(username = "aquila-login", nickname = "아퀼라")
        val failureTypes = mutableListOf<FeedPostDtoMappingFailureType>()
        setContentFieldToNull(post)

        val dto =
            FeedPostDto.from(post) { _, failureType, _ ->
                failureTypes += failureType
            }

        assertThat(dto.authorName).isEqualTo("아퀼라")
        assertThat(dto.authorUsername).isEqualTo("아퀼라")
        assertThat(dto.thumbnail).isNull()
        assertThat(dto.tags).isEmpty()
        assertThat(dto.category).isEmpty()
        assertThat(failureTypes).containsExactly(
            FeedPostDtoMappingFailureType.META,
            FeedPostDtoMappingFailureType.PREVIEW,
        )
    }

    @Test
    @DisplayName("detail DTO는 authorUsername에 login_id 대신 nickname을 마스킹한다")
    fun mapsDetailAuthorUsernameToNicknameMask() {
        val post = postByAuthor(username = "aquila-login", nickname = "아퀼라")

        val dto = PostWithContentDto(post)

        assertThat(dto.authorName).isEqualTo("아퀼라")
        assertThat(dto.authorUsername).isEqualTo("아퀼라")
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

    private fun setContentFieldToNull(post: Post) {
        Post::class.java
            .getDeclaredField("content")
            .apply { isAccessible = true }
            .set(post, null)
    }
}
