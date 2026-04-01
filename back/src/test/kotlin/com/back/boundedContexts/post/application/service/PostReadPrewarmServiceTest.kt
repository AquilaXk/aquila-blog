package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.input.PostPublicReadQueryUseCase
import com.back.boundedContexts.post.dto.CursorFeedPageDto
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.time.Instant

@DisplayName("PostReadPrewarmService 테스트")
class PostReadPrewarmServiceTest {
    @Test
    fun `모든 prewarm step이 실패하면 예외를 던진다`() {
        val useCase =
            FakePostPublicReadQueryUseCase(
                failFeedByCursor = true,
                failExplore = true,
                failTagCounts = true,
                failDetail = true,
                failExploreByCursor = true,
            )
        val sut = PostReadPrewarmService(postPublicReadQueryUseCase = useCase, pageSize = 30, maxTagWarmups = 3)

        assertThatThrownBy {
            sut.prewarm(postId = 101L, tags = listOf("kotlin"), warmDetail = true)
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("post_read_prewarm_all_failed")
    }

    @Test
    fun `일부 prewarm step이 성공하면 예외를 던지지 않는다`() {
        val useCase =
            FakePostPublicReadQueryUseCase(
                failFeedByCursor = false,
                failExplore = true,
                failTagCounts = true,
                failDetail = true,
                failExploreByCursor = true,
            )
        val sut = PostReadPrewarmService(postPublicReadQueryUseCase = useCase, pageSize = 30, maxTagWarmups = 3)

        sut.prewarm(postId = 102L, tags = listOf("kotlin"), warmDetail = true)
    }

    private class FakePostPublicReadQueryUseCase(
        private val failFeedByCursor: Boolean = false,
        private val failExplore: Boolean = false,
        private val failTagCounts: Boolean = false,
        private val failDetail: Boolean = false,
        private val failExploreByCursor: Boolean = false,
    ) : PostPublicReadQueryUseCase {
        override fun getPublicFeed(
            page: Int,
            pageSize: Int,
            sort: PostSearchSortType1,
        ): PageDto<FeedPostDto> = PageDto()

        override fun getPublicFeedByCursor(
            cursor: String?,
            pageSize: Int,
            sort: PostSearchSortType1,
        ): CursorFeedPageDto {
            if (failFeedByCursor) throw IllegalStateException("feed fail")
            return CursorFeedPageDto(content = emptyList(), pageSize = pageSize, hasNext = false)
        }

        override fun getPublicExplore(
            page: Int,
            pageSize: Int,
            kw: String,
            tag: String,
            sort: PostSearchSortType1,
        ): PageDto<FeedPostDto> {
            if (failExplore) throw IllegalStateException("explore fail")
            return PageDto()
        }

        override fun getPublicExploreByCursor(
            cursor: String?,
            pageSize: Int,
            tag: String,
            sort: PostSearchSortType1,
        ): CursorFeedPageDto {
            if (failExploreByCursor) throw IllegalStateException("explore by cursor fail")
            return CursorFeedPageDto(content = emptyList(), pageSize = pageSize, hasNext = false)
        }

        override fun getPublicSearch(
            page: Int,
            pageSize: Int,
            kw: String,
            sort: PostSearchSortType1,
        ): PageDto<FeedPostDto> = PageDto()

        override fun getPublicPostDetail(id: Long): PostWithContentDto {
            if (failDetail) throw IllegalStateException("detail fail")
            return PostWithContentDto(
                id = id,
                createdAt = Instant.EPOCH,
                modifiedAt = Instant.EPOCH,
                authorId = 1L,
                authorName = "author",
                authorUsername = "author",
                authorProfileImageUrl = "",
                authorProfileImageDirectUrl = "",
                title = "title",
                content = "content",
                contentHtml = null,
                version = 0L,
                published = true,
                listed = true,
                likesCount = 0,
                commentsCount = 0,
                hitCount = 0,
            )
        }

        override fun getPublicRelatedByAuthor(
            authorId: Long,
            excludePostId: Long?,
            limit: Int,
        ): List<FeedPostDto> = emptyList()

        override fun getPublicTagCounts(): List<TagCountDto> {
            if (failTagCounts) throw IllegalStateException("tag fail")
            return emptyList()
        }
    }
}
