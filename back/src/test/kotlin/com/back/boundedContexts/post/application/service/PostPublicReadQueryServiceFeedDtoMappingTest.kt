package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.domain.Post
import com.back.global.app.AppConfig
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock
import org.mockito.Mockito.times
import org.springframework.cache.concurrent.ConcurrentMapCacheManager
import java.time.Instant

@DisplayName("공개 게시글 feed DTO 매핑")
class PostPublicReadQueryServiceFeedDtoMappingTest {
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
    @DisplayName("핵심 필드 매핑 실패 행은 feed 응답에서 제외하고 metric을 기록한다")
    fun excludesCoreMappingFailureRowFromFeed() {
        val postUseCase = mock(PostUseCase::class.java)
        val meterRegistry = SimpleMeterRegistry()
        val service = createService(postUseCase, meterRegistry)
        val validPost = postByAuthor(id = 10L)
        val invalidPost = postWithoutAuditTimestamps(id = 11L)
        given(postUseCase.findPagedByKw("", PostSearchSortType1.CREATED_AT, 1, 10))
            .willReturn(
                PagedResult(
                    content = listOf(validPost, invalidPost),
                    page = 1,
                    pageSize = 10,
                    totalElements = 2,
                ),
            )

        val page = service.getPublicFeed(1, 10, PostSearchSortType1.CREATED_AT)

        assertThat(page.content.map { it.id }).containsExactly(10L)
        assertThat(page.pageable.totalElements).isEqualTo(2)
        assertThat(
            meterRegistry
                .get("post.feed.dto.mapping.failure")
                .tag("failureType", "core")
                .counter()
                .count(),
        ).isEqualTo(1.0)
    }

    @Test
    @DisplayName("cursor feed는 제외된 row가 있어도 소비한 raw boundary로 다음 cursor를 만든다")
    fun advancesCursorByConsumedRawBoundaryWhenRowIsFiltered() {
        val postUseCase = mock(PostUseCase::class.java)
        val meterRegistry = SimpleMeterRegistry()
        val service = createService(postUseCase, meterRegistry)
        val invalidBoundaryPost = postWithMissingAuthor(id = 20L)
        val nextRawPost = postByAuthor(id = 21L)
        given(
            postUseCase.findPublicByCursor(
                cursorCreatedAt = null,
                cursorId = null,
                limit = 2,
                sort = PostSearchSortType1.CREATED_AT,
            ),
        ).willReturn(listOf(invalidBoundaryPost, nextRawPost))
        given(
            postUseCase.findPublicByCursor(
                cursorCreatedAt = Instant.parse("2026-01-02T00:00:00Z"),
                cursorId = 20L,
                limit = 2,
                sort = PostSearchSortType1.CREATED_AT,
            ),
        ).willReturn(listOf(nextRawPost))

        val page = service.getPublicFeedByCursor(null, 1, PostSearchSortType1.CREATED_AT)
        val nextPage = service.getPublicFeedByCursor(page.nextCursor, 1, PostSearchSortType1.CREATED_AT)

        assertThat(page.content).isEmpty()
        assertThat(page.hasNext).isTrue()
        assertThat(page.nextCursor).isNotBlank()
        assertThat(nextPage.content.map { it.id }).containsExactly(21L)
        assertThat(nextPage.hasNext).isFalse()
        assertThat(
            meterRegistry
                .get("post.feed.dto.mapping.failure")
                .tag("failureType", "core")
                .counter()
                .count(),
        ).isEqualTo(1.0)
    }

    @Test
    @DisplayName("search는 매핑 실패로 빈 응답이 되어도 negative cache를 기록하지 않는다")
    fun doesNotNegativeCacheSearchWhenRowsAreFilteredByMappingFailure() {
        val postUseCase = mock(PostUseCase::class.java)
        val service = createService(postUseCase, SimpleMeterRegistry())
        val invalidPost = postWithMissingAuthor(id = 30L)
        given(postUseCase.findPagedByKw("kw", PostSearchSortType1.CREATED_AT, 1, 10))
            .willReturn(
                PagedResult(
                    content = listOf(invalidPost),
                    page = 1,
                    pageSize = 10,
                    totalElements = 1,
                ),
            )

        val firstPage = service.getPublicSearch(1, 10, "kw", PostSearchSortType1.CREATED_AT)
        val secondPage = service.getPublicSearch(1, 10, "kw", PostSearchSortType1.CREATED_AT)

        assertThat(firstPage.content).isEmpty()
        assertThat(secondPage.content).isEmpty()
        then(postUseCase)
            .should(times(2))
            .findPagedByKw("kw", PostSearchSortType1.CREATED_AT, 1, 10)
    }

    private fun createService(
        postUseCase: PostUseCase,
        meterRegistry: SimpleMeterRegistry,
    ): PostPublicReadQueryService =
        PostPublicReadQueryService(
            postUseCase = postUseCase,
            postReadBulkheadService =
                PostReadBulkheadService(
                    enabled = false,
                    acquireTimeoutMs = 0,
                    feedMaxConcurrent = 1,
                    exploreMaxConcurrent = 1,
                    searchMaxConcurrent = 1,
                    detailMaxConcurrent = 1,
                    tagsMaxConcurrent = 1,
                ),
            cacheManager = ConcurrentMapCacheManager(),
            meterRegistry = meterRegistry,
            cursorSigningSecret = "test-secret",
            detailContentCacheMaxChars = 120000,
            detailSnapshotCacheMaxChars = 180000,
        )

    private fun postByAuthor(id: Long): Post =
        postWithoutAuditTimestamps(id).apply {
            createdAt = Instant.parse("2026-01-02T00:00:00Z")
            modifiedAt = Instant.parse("2026-01-02T00:01:00Z")
        }

    private fun postWithMissingAuthor(id: Long): Post =
        postByAuthor(id).also { post ->
            Post::class.java
                .getDeclaredField("author")
                .apply { isAccessible = true }
                .set(post, null)
        }

    private fun postWithoutAuditTimestamps(id: Long): Post =
        Post(
            id = id,
            author =
                Member(
                    id = 1L,
                    username = "aquila-login",
                    password = null,
                    nickname = "아퀼라",
                    email = null,
                ).apply {
                    createdAt = Instant.parse("2026-01-01T00:00:00Z")
                    modifiedAt = Instant.parse("2026-01-01T00:01:00Z")
                },
            title = "작성자 매핑",
            content = "본문",
            published = true,
            listed = true,
        )
}
