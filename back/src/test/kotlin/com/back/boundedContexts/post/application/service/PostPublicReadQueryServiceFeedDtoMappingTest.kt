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
import org.mockito.Mockito.mock
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
