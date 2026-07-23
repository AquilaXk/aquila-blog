package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.dto.CursorFeedPageDto
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.PublicPostsBootstrapDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.page.PageableDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import java.time.Instant

@DisplayName("PostPublicReadResponseFactory 테스트")
class PostPublicReadResponseFactoryTest {
    private val responseFactory = PostPublicReadResponseFactory()

    @Test
    @DisplayName("공개 read 응답은 Cache-Control, surrogate key, ETag, Server-Timing을 한 번에 조립한다")
    fun respondWithPublicCacheHeadersAndEtag() {
        // given
        val request = MockHttpServletRequest()
        val response = MockHttpServletResponse()
        val policy =
            PublicReadCachePolicy(
                name = "test-max10-smax20-swr30",
                maxAgeSeconds = 10,
                sharedMaxAgeSeconds = 20,
                staleWhileRevalidateSeconds = 30,
            )

        // when
        val result =
            responseFactory.respondWithEtag(
                request = request,
                response = response,
                cachePolicy = policy,
                surrogateKeys = setOf("Post:123", "tag: Kotlin!", "tag: Kotlin!"),
                etagSeed = "post|123|1",
                startedAtNanos = System.nanoTime(),
                body = "payload",
            )

        // then
        assertThat(result.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(result.body).isEqualTo("payload")
        assertThat(response.getHeaders(HttpHeaders.CACHE_CONTROL)).containsExactly(
            "public, max-age=10, s-maxage=20, stale-while-revalidate=30, stale-if-error=50",
        )
        assertThat(response.getHeader("X-Cache-Policy")).isEqualTo("test-max10-smax20-swr30")
        assertThat(response.getHeader("Surrogate-Key")).isEqualTo("post:123 tag:-kotlin")
        assertThat(response.getHeader("Cache-Tag")).isEqualTo("post:123,tag:-kotlin")
        assertThat(response.getHeader(HttpHeaders.ETAG)).startsWith("W/\"").endsWith("\"")
        assertThat(response.getHeader("Server-Timing"))
            .contains("cache-policy;desc=\"test-max10-smax20-swr30\"")
            .contains("origin;dur=")
            .contains("etag-200")
    }

    @Test
    @DisplayName("If-None-Match가 현재 ETag와 맞으면 동일 헤더를 유지하고 304를 반환한다")
    fun respondNotModifiedWhenIfNoneMatchMatchesWeakEtag() {
        // given
        val firstRequest = MockHttpServletRequest()
        val firstResponse = MockHttpServletResponse()
        val policy =
            PublicReadCachePolicy(
                name = "test-max10-smax20-swr30",
                maxAgeSeconds = 10,
                sharedMaxAgeSeconds = 20,
                staleWhileRevalidateSeconds = 30,
            )
        responseFactory.respondWithEtag(
            request = firstRequest,
            response = firstResponse,
            cachePolicy = policy,
            surrogateKeys = setOf("post:123"),
            etagSeed = "post|123|1",
            startedAtNanos = System.nanoTime(),
            body = "payload",
        )
        val etag = requireNotNull(firstResponse.getHeader(HttpHeaders.ETAG))
        val request =
            MockHttpServletRequest().apply {
                addHeader(HttpHeaders.IF_NONE_MATCH, "\"other\", $etag")
            }
        val response = MockHttpServletResponse()

        // when
        val result =
            responseFactory.respondWithEtag(
                request = request,
                response = response,
                cachePolicy = policy,
                surrogateKeys = setOf("post:123"),
                etagSeed = "post|123|1",
                startedAtNanos = System.nanoTime(),
                body = "payload",
            )

        // then
        assertThat(result.statusCode).isEqualTo(HttpStatus.NOT_MODIFIED)
        assertThat(result.body).isNull()
        assertThat(response.status).isEqualTo(MockHttpServletResponse.SC_NOT_MODIFIED)
        assertThat(response.getHeader(HttpHeaders.ETAG)).isEqualTo(etag)
        assertThat(response.getHeader("Server-Timing"))
            .contains("cache;desc=\"etag-304\"")
            .contains("origin;dur=")
            .contains("etag-304")
    }

    @Test
    @DisplayName("no-store 검색 응답은 ETag 없이 private no-store와 cache policy timing만 반환한다")
    fun respondNoStoreWithoutEtag() {
        // given
        val response = MockHttpServletResponse()
        val policy =
            PublicReadCachePolicy(
                name = "search-high-entropy-no-store",
                maxAgeSeconds = 0,
                sharedMaxAgeSeconds = 0,
                staleWhileRevalidateSeconds = 0,
                noStore = true,
            )

        // when
        val result =
            responseFactory.respondNoStore(
                response = response,
                cachePolicy = policy,
                surrogateKeys = setOf("search", "tag:Secret"),
                startedAtNanos = System.nanoTime(),
                originDescription = "search-no-store",
                body = "payload",
            )

        // then
        assertThat(result.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(result.body).isEqualTo("payload")
        assertThat(response.getHeader(HttpHeaders.CACHE_CONTROL)).isEqualTo("private, no-store, max-age=0")
        assertThat(response.getHeader(HttpHeaders.ETAG)).isNull()
        assertThat(response.getHeader("X-Cache-Policy")).isEqualTo("search-high-entropy-no-store")
        assertThat(response.getHeader("Surrogate-Key")).isEqualTo("search tag:secret")
        assertThat(response.getHeader("Server-Timing"))
            .contains("cache-policy;desc=\"search-high-entropy-no-store\"")
            .contains("origin;dur=")
            .contains("search-no-store")
    }

    @Test
    @DisplayName("공개 cache 응답은 음수 TTL을 보정하고 빈 surrogate key면 관련 헤더를 생략한다")
    fun respondWithSafeCachePolicyAndWithoutEmptySurrogateHeaders() {
        // given
        val request = MockHttpServletRequest()
        val response = MockHttpServletResponse()
        val policy =
            PublicReadCachePolicy(
                name = "unsafe-negative-policy",
                maxAgeSeconds = -10,
                sharedMaxAgeSeconds = -5,
                staleWhileRevalidateSeconds = -1,
            )

        // when
        responseFactory.respondWithEtag(
            request = request,
            response = response,
            cachePolicy = policy,
            surrogateKeys = setOf(" !!! ", ""),
            etagSeed = "seed",
            startedAtNanos = System.nanoTime(),
            body = "payload",
        )

        // then
        assertThat(response.getHeader(HttpHeaders.CACHE_CONTROL)).isEqualTo(
            "public, max-age=0, s-maxage=0, stale-while-revalidate=0, stale-if-error=0",
        )
        assertThat(response.getHeader("Surrogate-Key")).isNull()
        assertThat(response.getHeader("Cache-Tag")).isNull()
    }

    @Test
    @DisplayName("If-None-Match 와일드카드는 현재 ETag와 무관하게 304를 반환한다")
    fun respondNotModifiedWhenIfNoneMatchWildcard() {
        // given
        val request =
            MockHttpServletRequest().apply {
                addHeader(HttpHeaders.IF_NONE_MATCH, "*")
            }
        val response = MockHttpServletResponse()

        // when
        val result =
            responseFactory.respondWithEtag(
                request = request,
                response = response,
                cachePolicy = PostPublicReadCachePolicies.FEED,
                surrogateKeys = emptySet(),
                etagSeed = "any-current-seed",
                startedAtNanos = System.nanoTime(),
                body = "payload",
            )

        // then
        assertThat(result.statusCode).isEqualTo(HttpStatus.NOT_MODIFIED)
        assertThat(response.status).isEqualTo(MockHttpServletResponse.SC_NOT_MODIFIED)
    }

    @Test
    @DisplayName("검색어 cache policy는 공백, 짧은 검색어, 긴 검색어, 고엔트로피 검색어를 구분한다")
    fun resolveSearchReadCachePolicyByKeywordShape() {
        assertThat(responseFactory.resolveSearchReadCachePolicy("   "))
            .isSameAs(PostPublicReadCachePolicies.SEARCH_DEFAULT)
        assertThat(responseFactory.resolveSearchReadCachePolicy("kotlin"))
            .isSameAs(PostPublicReadCachePolicies.SEARCH_DEFAULT)
        assertThat(responseFactory.resolveSearchReadCachePolicy("kotlin spring api"))
            .isSameAs(PostPublicReadCachePolicies.SEARCH_SHORT)
        assertThat(responseFactory.resolveSearchReadCachePolicy("one two three four"))
            .isSameAs(PostPublicReadCachePolicies.SEARCH_NO_STORE)
        assertThat(responseFactory.resolveSearchReadCachePolicy("abcdefghijklmnopqrstuvwxyz12"))
            .isSameAs(PostPublicReadCachePolicies.SEARCH_NO_STORE)
        assertThat(responseFactory.resolveSearchReadCachePolicy("abcd1234efgh5678"))
            .isSameAs(PostPublicReadCachePolicies.SEARCH_NO_STORE)
        assertThat(responseFactory.resolveSearchReadCachePolicy("aaaaaaaaaaaaaaaa"))
            .isSameAs(PostPublicReadCachePolicies.SEARCH_SHORT)
    }

    @Test
    @DisplayName("ETag seed builder는 공개 read 응답별 변동 필드를 반영한다")
    fun buildEtagSeedsForPublicReadResponses() {
        // given
        val firstPost = feedPost(id = 1L, modifiedAt = Instant.parse("2026-01-01T00:00:00Z"))
        val secondPost = feedPost(id = 2L, modifiedAt = Instant.parse("2026-01-02T00:00:00Z"))
        val page =
            PageDto(
                content = listOf(firstPost, secondPost),
                pageable =
                    PageableDto(
                        pageNumber = 2,
                        pageSize = 10,
                        totalElements = 22,
                        totalPages = 3,
                        numberOfElements = 2,
                    ),
            )
        val cursorFeed =
            CursorFeedPageDto(
                content = listOf(firstPost),
                pageSize = 10,
                hasNext = true,
                nextCursor = "next-1",
            )
        val tags = listOf(TagCountDto(tag = "Kotlin", count = 3), TagCountDto(tag = "Spring", count = 2))
        val bootstrap = PublicPostsBootstrapDto(feed = cursorFeed, tags = tags)

        // when
        val pageSeed =
            responseFactory.buildFeedPageEtagSeed(
                source = "search",
                page = 2,
                pageSize = 10,
                sort = PostSearchSortType1.CREATED_AT,
                kw = " kotlin ",
                tag = " spring ",
                data = page,
            )
        val cursorSeed =
            responseFactory.buildCursorFeedEtagSeed(
                source = "feed-cursor",
                pageSize = 10,
                sort = PostSearchSortType1.CREATED_AT,
                cursor = " cursor-1 ",
                tag = " backend ",
                data = cursorFeed,
            )
        val detailSeed =
            responseFactory.buildPublicDetailEtagSeed(
                PostWithContentDto(
                    id = 9L,
                    createdAt = Instant.parse("2026-01-01T00:00:00Z"),
                    modifiedAt = Instant.parse("2026-01-03T00:00:00Z"),
                    authorId = 1L,
                    authorName = "Author",
                    authorUsername = "author",
                    authorProfileImageUrl = "https://example.com/profile.png",
                    authorProfileImageDirectUrl = "https://example.com/profile-direct.png",
                    title = "Title",
                    content = "content",
                    contentHtml = "<p>content</p>",
                    version = 7L,
                    published = true,
                    listed = true,
                    likesCount = 8,
                    commentsCount = 9,
                    hitCount = 10,
                ),
            )
        val relatedSeed =
            responseFactory.buildRelatedAuthorEtagSeed(
                authorId = 3L,
                excludePostId = null,
                limit = 4,
                posts = listOf(secondPost),
            )
        val bootstrapFeedSeed =
            responseFactory.buildBootstrapEtagSeed(
                pageSize = 10,
                sort = PostSearchSortType1.CREATED_AT,
                tag = "",
                data = bootstrap,
            )
        val bootstrapExploreSeed =
            responseFactory.buildBootstrapEtagSeed(
                pageSize = 10,
                sort = PostSearchSortType1.CREATED_AT,
                tag = "kotlin",
                data = bootstrap,
            )

        // then
        assertThat(pageSeed).isEqualTo(
            "search|page=2|size=10|sort=CREATED_AT|kw=kotlin|tag=spring|total=22|pages=3|" +
                "items=1:1767225600000:11:12:13:author=1:1,6:Author,6:author,31:https://example.com/profile.png|" +
                "2:1767312000000:11:12:13:author=1:1,6:Author,6:author,31:https://example.com/profile.png",
        )
        assertThat(cursorSeed).isEqualTo(
            "feed-cursor|size=10|sort=CREATED_AT|cursor=cursor-1|tag=backend|hasNext=true|nextCursor=next-1|" +
                "items=1:1767225600000:11:12:13:author=1:1,6:Author,6:author,31:https://example.com/profile.png",
        )
        assertThat(detailSeed).isEqualTo(
            "9|1767398400000|7|8|9|10|author=1:1,6:Author,6:author," +
                "31:https://example.com/profile.png,38:https://example.com/profile-direct.png",
        )
        assertThat(responseFactory.buildTagsEtagSeed(tags)).isEqualTo("Kotlin:3|Spring:2")
        assertThat(relatedSeed).isEqualTo(
            "related-author|authorId=3|excludePostId=0|limit=4|" +
                "items=2:1767312000000:11:12:13:author=1:1,6:Author,6:author,31:https://example.com/profile.png",
        )
        assertThat(bootstrapFeedSeed).startsWith("bootstrap-feed-cursor|")
        assertThat(bootstrapExploreSeed).startsWith("bootstrap-explore-cursor|")
    }

    @Test
    @DisplayName("ETag seed builder는 기본 검색어와 non-null 제외 post id 경로를 안정적으로 직렬화한다")
    fun buildEtagSeedsWithDefaultFiltersAndExcludedPost() {
        // given
        val post = feedPost(id = 7L, modifiedAt = Instant.parse("2026-01-07T00:00:00Z"))
        val page =
            PageDto(
                content = listOf(post),
                pageable =
                    PageableDto(
                        pageNumber = 0,
                        pageSize = 20,
                        totalElements = 1,
                        totalPages = 1,
                        numberOfElements = 1,
                    ),
            )
        val cursorFeed =
            CursorFeedPageDto(
                content = listOf(post),
                pageSize = 20,
                hasNext = false,
                nextCursor = null,
            )
        val seedBuilder = PostPublicReadEtagSeedBuilder()

        // when
        val pageSeed =
            seedBuilder.buildFeedPageEtagSeed(
                source = "feed",
                page = 0,
                pageSize = 20,
                sort = PostSearchSortType1.CREATED_AT,
                data = page,
            )
        val cursorSeed =
            seedBuilder.buildCursorFeedEtagSeed(
                source = "feed-cursor",
                pageSize = 20,
                sort = PostSearchSortType1.CREATED_AT,
                cursor = null,
                data = cursorFeed,
            )
        val relatedSeed =
            seedBuilder.buildRelatedAuthorEtagSeed(
                authorId = 3L,
                excludePostId = 7L,
                limit = 4,
                posts = listOf(post),
            )

        // then
        assertThat(pageSeed).contains("|kw=|tag=|")
        assertThat(cursorSeed).contains("|cursor=|tag=|hasNext=false|nextCursor=|")
        assertThat(relatedSeed).contains("|excludePostId=7|")
    }

    @Test
    @DisplayName("ETag seed builder는 작성자 표현 필드 변경을 공개 read 표현 변경으로 반영한다")
    fun buildEtagSeedsWithAuthorRepresentationFields() {
        val basePost = feedPost(id = 1L, modifiedAt = Instant.parse("2026-01-01T00:00:00Z"))
        val renamedPost = basePost.copy(authorName = "Renamed Author")
        val usernameChangedPost = basePost.copy(authorUsername = "renamed-author")
        val profileChangedPost = basePost.copy(authorProfileImgUrl = "https://example.com/profile-v2.png")
        val baseDetail = detailPost()
        val renamedDetail = baseDetail.copy(authorName = "Renamed Author")
        val usernameChangedDetail = baseDetail.copy(authorUsername = "renamed-author")
        val profileChangedDetail = baseDetail.copy(authorProfileImageUrl = "https://example.com/profile-v2.png")

        val baseFeedSeed = responseFactory.buildFeedPageEtagSeed("feed", 0, 10, PostSearchSortType1.CREATED_AT, data = pageOf(basePost))
        val baseDetailSeed = responseFactory.buildPublicDetailEtagSeed(baseDetail)

        assertThat(responseFactory.buildFeedPageEtagSeed("feed", 0, 10, PostSearchSortType1.CREATED_AT, data = pageOf(renamedPost)))
            .isNotEqualTo(baseFeedSeed)
        assertThat(responseFactory.buildFeedPageEtagSeed("feed", 0, 10, PostSearchSortType1.CREATED_AT, data = pageOf(usernameChangedPost)))
            .isNotEqualTo(baseFeedSeed)
        assertThat(responseFactory.buildFeedPageEtagSeed("feed", 0, 10, PostSearchSortType1.CREATED_AT, data = pageOf(profileChangedPost)))
            .isNotEqualTo(baseFeedSeed)

        assertThat(responseFactory.buildPublicDetailEtagSeed(renamedDetail)).isNotEqualTo(baseDetailSeed)
        assertThat(responseFactory.buildPublicDetailEtagSeed(usernameChangedDetail)).isNotEqualTo(baseDetailSeed)
        assertThat(responseFactory.buildPublicDetailEtagSeed(profileChangedDetail)).isNotEqualTo(baseDetailSeed)
    }

    @Test
    @DisplayName("공개 read cache policy registry는 모든 endpoint 정책을 노출한다")
    fun exposeAllPublicReadCachePolicies() {
        val policies =
            listOf(
                PostPublicReadCachePolicies.FEED,
                PostPublicReadCachePolicies.FEED_CURSOR,
                PostPublicReadCachePolicies.EXPLORE,
                PostPublicReadCachePolicies.EXPLORE_CURSOR,
                PostPublicReadCachePolicies.SEARCH_DEFAULT,
                PostPublicReadCachePolicies.SEARCH_SHORT,
                PostPublicReadCachePolicies.SEARCH_NO_STORE,
                PostPublicReadCachePolicies.TAGS,
                PostPublicReadCachePolicies.BOOTSTRAP,
                PostPublicReadCachePolicies.DETAIL,
                PostPublicReadCachePolicies.RELATED_AUTHOR,
            )

        assertThat(policies.map { it.name }).containsExactly(
            "feed-max20-smax60-swr60",
            "feed-cursor-max20-smax60-swr60",
            "explore-max20-smax60-swr60",
            "explore-cursor-max20-smax60-swr60",
            "search-max15-smax45-swr45",
            "search-short-max5-smax10-swr15",
            "search-high-entropy-no-store",
            "tags-max60-smax300-swr300",
            "bootstrap-max20-smax60-swr60",
            "detail-max20-smax60-swr60",
            "related-author-max15-smax45-swr45",
        )
        assertThat(PostPublicReadCachePolicies.SEARCH_NO_STORE.noStore).isTrue()
        assertThat(PostPublicReadCachePolicies.RELATED_AUTHOR.sharedMaxAgeSeconds).isEqualTo(45)
    }

    private fun feedPost(
        id: Long,
        modifiedAt: Instant,
    ): FeedPostDto =
        FeedPostDto(
            id = id,
            createdAt = Instant.parse("2026-01-01T00:00:00Z"),
            modifiedAt = modifiedAt,
            authorId = 1L,
            authorName = "Author",
            authorUsername = "author",
            authorProfileImgUrl = "https://example.com/profile.png",
            title = "Title $id",
            thumbnail = null,
            summary = "Summary $id",
            tags = listOf("kotlin"),
            category = listOf("backend"),
            published = true,
            listed = true,
            likesCount = 11,
            commentsCount = 12,
            hitCount = 13,
        )

    private fun pageOf(post: FeedPostDto): PageDto<FeedPostDto> =
        PageDto(
            content = listOf(post),
            pageable =
                PageableDto(
                    pageNumber = 0,
                    pageSize = 10,
                    totalElements = 1,
                    totalPages = 1,
                    numberOfElements = 1,
                ),
        )

    private fun detailPost(): PostWithContentDto =
        PostWithContentDto(
            id = 9L,
            createdAt = Instant.parse("2026-01-01T00:00:00Z"),
            modifiedAt = Instant.parse("2026-01-03T00:00:00Z"),
            authorId = 1L,
            authorName = "Author",
            authorUsername = "author",
            authorProfileImageUrl = "https://example.com/profile.png",
            authorProfileImageDirectUrl = "https://example.com/profile-direct.png",
            title = "Title",
            content = "content",
            contentHtml = "<p>content</p>",
            version = 7L,
            published = true,
            listed = true,
            likesCount = 8,
            commentsCount = 9,
            hitCount = 10,
        )
}
