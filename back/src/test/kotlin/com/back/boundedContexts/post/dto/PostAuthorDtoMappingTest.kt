package com.back.boundedContexts.post.dto

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.model.PostSummarySource
import com.back.global.app.AppConfig
import com.back.standard.util.Ut
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.time.Instant

@DisplayName("게시글 작성자 DTO 매핑")
class PostAuthorDtoMappingTest {
    companion object {
        @JvmStatic
        @BeforeAll
        fun initAppConfig() {
            Ut.JSON.objectMapper = jacksonObjectMapper()
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
        assertThat(dto.summary).isEqualTo("저장된 canonical 요약")
        assertThat(dto.summarySource).isEqualTo(PostSummarySource.EXTRACTED)
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
        assertThat(dto.summary).isEqualTo("저장된 canonical 요약")
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
        assertThat(dto.summary).isEqualTo("저장된 canonical 요약")
    }

    @Test
    @DisplayName("detail DTO 및 공개 상세 캐시 DTO는 명시 썸네일과 본문 추출 썸네일을 보존한다")
    fun mapsAndPreservesDetailThumbnailAcrossCacheDtos() {
        val markdownThumbnailPost =
            postByAuthor(username = "aquila-login", nickname = "아퀼라").apply {
                content = "본문 앞단\n\n![대표 이미지](https://cdn.example.com/posts/10/cover.webp)\n\n본문 뒷단"
            }

        val extractedDetail = PostWithContentDto(markdownThumbnailPost)
        val mergedFromMetaAndContent =
            PublicPostDetailMetaCacheDto
                .from(markdownThumbnailPost)
                .merge(PublicPostDetailContentCacheDto.from(markdownThumbnailPost))
        val restoredFromSnapshot =
            PublicPostDetailSnapshotCacheDto
                .from(extractedDetail)
                .toPostWithContentDto()

        assertThat(extractedDetail.thumbnail).isEqualTo("https://cdn.example.com/posts/10/cover.webp")
        assertThat(mergedFromMetaAndContent.thumbnail).isEqualTo("https://cdn.example.com/posts/10/cover.webp")
        assertThat(restoredFromSnapshot.thumbnail).isEqualTo("https://cdn.example.com/posts/10/cover.webp")

        val explicitThumbnailPost =
            postByAuthor(username = "aquila-login", nickname = "아퀼라").apply {
                thumbnail = "https://cdn.example.com/posts/10/explicit.webp"
                content = "![본문 이미지](https://cdn.example.com/posts/10/cover.webp)"
            }

        assertThat(PostWithContentDto(explicitThumbnailPost).thumbnail)
            .isEqualTo("https://cdn.example.com/posts/10/explicit.webp")
        assertThat(PublicPostDetailMetaCacheDto.from(explicitThumbnailPost).thumbnail)
            .isEqualTo("https://cdn.example.com/posts/10/explicit.webp")
    }

    @Test
    @DisplayName("action log DTO는 canonical summary 원문을 제거한다")
    fun removesCanonicalSummaryFromEventLogDto() {
        val eventLogDto =
            PostDto(
                id = 1L,
                createdAt = Instant.EPOCH,
                modifiedAt = Instant.EPOCH,
                authorId = 2L,
                authorName = "작성자",
                authorUsername = "author",
                authorProfileImgUrl = "",
                title = "제목 원문",
                summary = "요약 원문",
                version = 0L,
                published = true,
                listed = true,
                likesCount = 0,
                hitCount = 0,
            ).forEventLog()

        assertThat(eventLogDto.title).isEmpty()
        assertThat(eventLogDto.summary).isEmpty()
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
                setProfileWorkspacePublishedContent(MemberProfileWorkspaceContent())
            }
        return Post(
            id = 10L,
            author = author,
            title = "작성자 매핑",
            content = "본문",
            published = true,
            listed = true,
            summaryText = "저장된 canonical 요약",
            summarySource = PostSummarySource.EXTRACTED,
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
