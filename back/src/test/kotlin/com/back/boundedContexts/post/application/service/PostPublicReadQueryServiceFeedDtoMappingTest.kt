package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock
import org.mockito.Mockito.times
import org.springframework.cache.concurrent.ConcurrentMapCacheManager
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

@DisplayName("공개 게시글 feed DTO 매핑")
class PostPublicReadQueryServiceFeedDtoMappingTest {
    companion object {
        private const val MAPPING_FAILURE_METRIC = "post.feed.dto.mapping.failure"
        private const val CURSOR_TEST_SECRET = "test-secret"

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
                .get(MAPPING_FAILURE_METRIC)
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
                cursorSortValue = null,
                cursorId = null,
                limit = 3,
                sort = PostSearchSortType1.CREATED_AT,
            ),
        ).willReturn(listOf(invalidBoundaryPost, nextRawPost))
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = Instant.parse("2026-01-02T00:00:00Z").toEpochMilli(),
                cursorId = 20L,
                limit = 3,
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
                .get(MAPPING_FAILURE_METRIC)
                .tag("failureType", "core")
                .counter()
                .count(),
        ).isEqualTo(1.0)
    }

    @Test
    @DisplayName("cursor feed는 boundary row의 audit timestamp가 없어도 다음 row를 숨기지 않는다")
    fun doesNotHideNextRowWhenFilteredBoundaryRowHasNoAuditTimestamp() {
        val postUseCase = mock(PostUseCase::class.java)
        val meterRegistry = SimpleMeterRegistry()
        val service = createService(postUseCase, meterRegistry)
        val invalidBoundaryPost = postWithoutAuditTimestamps(id = 22L)
        val nextRawPost = postByAuthor(id = 23L)
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = null,
                cursorId = null,
                limit = 3,
                sort = PostSearchSortType1.CREATED_AT,
            ),
        ).willReturn(listOf(invalidBoundaryPost, nextRawPost))

        val page = service.getPublicFeedByCursor(null, 1, PostSearchSortType1.CREATED_AT)

        assertThat(page.content.map { it.id }).containsExactly(23L)
        assertThat(page.hasNext).isFalse()
        assertThat(page.nextCursor).isNull()
        assertThat(
            meterRegistry
                .get(MAPPING_FAILURE_METRIC)
                .tag("failureType", "core")
                .counter()
                .count(),
        ).isEqualTo(1.0)
    }

    @Test
    @DisplayName("HIT_COUNT 커서 feed는 (hitCount, id) 복합 커서로 다음 페이지를 이어간다")
    fun advancesHitCountCursorByCompositeSortValueAndId() {
        val postUseCase = mock(PostUseCase::class.java)
        val service = createService(postUseCase, SimpleMeterRegistry())
        val first = postByAuthor(id = 31L).also { it.hitCountAttr = PostAttr(1L, it, HIT_COUNT, 50) }
        val second = postByAuthor(id = 30L).also { it.hitCountAttr = PostAttr(2L, it, HIT_COUNT, 50) }
        val third = postByAuthor(id = 29L).also { it.hitCountAttr = PostAttr(3L, it, HIT_COUNT, 10) }
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = null,
                cursorId = null,
                limit = 4,
                sort = PostSearchSortType1.HIT_COUNT,
            ),
        ).willReturn(listOf(first, second, third))
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = 50L,
                cursorId = 30L,
                limit = 4,
                sort = PostSearchSortType1.HIT_COUNT,
            ),
        ).willReturn(listOf(third))

        val page = service.getPublicFeedByCursor(null, 2, PostSearchSortType1.HIT_COUNT)
        val nextPage = service.getPublicFeedByCursor(page.nextCursor, 2, PostSearchSortType1.HIT_COUNT)

        assertThat(page.content.map { it.id }).containsExactly(31L, 30L)
        assertThat(page.hasNext).isTrue()
        assertThat(page.nextCursor).isNotBlank()
        assertThat(nextPage.content.map { it.id }).containsExactly(29L)
        assertThat(nextPage.hasNext).isFalse()
        then(postUseCase)
            .should()
            .findPublicByCursor(
                cursorSortValue = 50L,
                cursorId = 30L,
                limit = 4,
                sort = PostSearchSortType1.HIT_COUNT,
            )
        assertThat(page.nextCursor).contains(":HIT_COUNT:")
    }

    @Test
    @DisplayName("legacy CREATED_AT 커서는 CREATED_AT/CREATED_AT_ASC 요청에서 허용한다")
    fun acceptsLegacyCreatedAtCursorForCreatedAtSorts() {
        val postUseCase = mock(PostUseCase::class.java)
        val service = createService(postUseCase, SimpleMeterRegistry())
        val nextRawPost = postByAuthor(id = 41L)
        val ascNextRawPost = postByAuthor(id = 42L)
        val legacyCursor = signLegacyCursor(sortValue = 1_767_312_000_000L, id = 40L)
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = 1_767_312_000_000L,
                cursorId = 40L,
                limit = 3,
                sort = PostSearchSortType1.CREATED_AT,
            ),
        ).willReturn(listOf(nextRawPost))
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = 1_767_312_000_000L,
                cursorId = 40L,
                limit = 3,
                sort = PostSearchSortType1.CREATED_AT_ASC,
            ),
        ).willReturn(listOf(ascNextRawPost))

        val page = service.getPublicFeedByCursor(legacyCursor, 1, PostSearchSortType1.CREATED_AT)
        val ascPage = service.getPublicFeedByCursor(legacyCursor, 1, PostSearchSortType1.CREATED_AT_ASC)

        assertThat(page.content.map { it.id }).containsExactly(41L)
        assertThat(ascPage.content.map { it.id }).containsExactly(42L)
        assertThatThrownBy {
            service.getPublicFeedByCursor(legacyCursor, 1, PostSearchSortType1.HIT_COUNT)
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("정렬 모드가 없어")
    }

    @Test
    @DisplayName("sort-bound 커서는 요청 정렬과 다르면 400으로 거절한다")
    fun rejectsSortBoundCursorWhenRequestSortDoesNotMatch() {
        val postUseCase = mock(PostUseCase::class.java)
        val service = createService(postUseCase, SimpleMeterRegistry())
        val first = postByAuthor(id = 51L).also { it.hitCountAttr = PostAttr(1L, it, HIT_COUNT, 20) }
        val second = postByAuthor(id = 50L).also { it.hitCountAttr = PostAttr(2L, it, HIT_COUNT, 10) }
        given(
            postUseCase.findPublicByCursor(
                cursorSortValue = null,
                cursorId = null,
                limit = 3,
                sort = PostSearchSortType1.HIT_COUNT,
            ),
        ).willReturn(listOf(first, second))

        val page = service.getPublicFeedByCursor(null, 1, PostSearchSortType1.HIT_COUNT)

        assertThat(page.nextCursor).isNotBlank()
        assertThatThrownBy {
            service.getPublicFeedByCursor(page.nextCursor, 1, PostSearchSortType1.LIKES_COUNT)
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("일치하지 않습니다")
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
            cursorSigningSecret = CURSOR_TEST_SECRET,
            detailContentCacheMaxChars = 120000,
            detailSnapshotCacheMaxChars = 180000,
        )

    private fun signLegacyCursor(
        sortValue: Long,
        id: Long,
    ): String {
        val payload = "$sortValue:$id"
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(CURSOR_TEST_SECRET.toByteArray(StandardCharsets.UTF_8), "HmacSHA256"))
        val digest = mac.doFinal(payload.toByteArray(StandardCharsets.UTF_8))
        val signature = Base64.getUrlEncoder().withoutPadding().encodeToString(digest.copyOf(18))
        return "$payload:$signature"
    }

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
