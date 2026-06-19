package com.back.boundedContexts.post.application.service

import com.back.standard.dto.post.type1.PostSearchSortType1
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.cache.CacheManager
import org.springframework.cache.concurrent.ConcurrentMapCacheManager

@DisplayName("PostReadCacheInvalidator 테스트")
class PostReadCacheInvalidatorTest {
    private val meterRegistry = SimpleMeterRegistry()
    private val cacheManager = newCacheManager()
    private val invalidator = PostReadCacheInvalidator(cacheManager, meterRegistry)

    @Test
    @DisplayName("공개 글 변경은 hot feed, 검색 첫 페이지, 영향 태그, 상세 캐시를 함께 축출한다")
    fun invalidatePublicPostReadCaches() {
        // given
        val callbackCalls = mutableListOf<Unit>()
        put(PostQueryCacheNames.FEED, "page=1:size=30:sort=CREATED_AT")
        put(PostQueryCacheNames.EXPLORE, "page=1:size=30:sort=CREATED_AT:kw=_:tag=_")
        put(PostQueryCacheNames.EXPLORE, "page=1:size=30:sort=CREATED_AT:kw=_:tag=kotlin")
        put(PostQueryCacheNames.FEED_CURSOR_FIRST, "size=30:sort=CREATED_AT")
        put(PostQueryCacheNames.EXPLORE_CURSOR_FIRST, "size=30:sort=CREATED_AT:tag=kotlin")
        put(
            PostQueryCacheNames.BOOTSTRAP,
            PostPublicReadQueryService.buildBootstrapCacheKey(30, PostSearchSortType1.CREATED_AT, "Kotlin"),
        )
        put(PostQueryCacheNames.SEARCH, "page=1:size=30:sort=CREATED_AT:kw=_")
        put(PostQueryCacheNames.SEARCH_NEGATIVE, "page=1:size=30:sort=CREATED_AT:kw=_")
        put(PostQueryCacheNames.TAGS, "public")
        put(PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT, 77L)
        put(PostQueryCacheNames.DETAIL_PUBLIC_META, 77L)
        put(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT, 77L)
        put(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE, 77L)

        // when
        invalidator.invalidate(
            PostReadCacheInvalidationRequest(
                postId = 77L,
                beforeTags = listOf("Kotlin"),
                afterTags = listOf("Spring"),
                scope = PostReadCacheInvalidationScope.PublicPostCreated,
                evictReason = "test-public",
            ),
        ) {
            callbackCalls += Unit
        }

        // then
        assertThat(callbackCalls).hasSize(1)
        assertThat(get(PostQueryCacheNames.FEED, "page=1:size=30:sort=CREATED_AT")).isNull()
        assertThat(get(PostQueryCacheNames.EXPLORE, "page=1:size=30:sort=CREATED_AT:kw=_:tag=_")).isNull()
        assertThat(get(PostQueryCacheNames.EXPLORE, "page=1:size=30:sort=CREATED_AT:kw=_:tag=kotlin")).isNull()
        assertThat(get(PostQueryCacheNames.FEED_CURSOR_FIRST, "size=30:sort=CREATED_AT")).isNull()
        assertThat(get(PostQueryCacheNames.EXPLORE_CURSOR_FIRST, "size=30:sort=CREATED_AT:tag=kotlin")).isNull()
        assertThat(
            get(
                PostQueryCacheNames.BOOTSTRAP,
                PostPublicReadQueryService.buildBootstrapCacheKey(30, PostSearchSortType1.CREATED_AT, "Kotlin"),
            ),
        ).isNull()
        assertThat(get(PostQueryCacheNames.SEARCH, "page=1:size=30:sort=CREATED_AT:kw=_")).isNull()
        assertThat(get(PostQueryCacheNames.SEARCH_NEGATIVE, "page=1:size=30:sort=CREATED_AT:kw=_")).isNull()
        assertThat(get(PostQueryCacheNames.TAGS, "public")).isNull()
        assertThat(get(PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT, 77L)).isNull()
        assertThat(get(PostQueryCacheNames.DETAIL_PUBLIC_META, 77L)).isNull()
        assertThat(get(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT, 77L)).isNull()
        assertThat(get(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE, 77L)).isNull()
        assertThat(meterRegistry.find("post.read.cache.evict").counters()).isNotEmpty
    }

    @Test
    @DisplayName("postId 없는 상세 축출은 상세 캐시만 전체 clear하고 공개 태그 callback은 호출하지 않는다")
    fun invalidateAllDetailCachesWithoutTagEviction() {
        // given
        val callbackCalls = mutableListOf<Unit>()
        put(PostQueryCacheNames.FEED, "page=1:size=30:sort=CREATED_AT")
        put(PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT, 101L)
        put(PostQueryCacheNames.DETAIL_PUBLIC_META, 101L)
        put(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT, 101L)
        put(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE, 101L)

        // when
        invalidator.invalidate(
            PostReadCacheInvalidationRequest(
                postId = null,
                beforeTags = emptyList(),
                afterTags = emptyList(),
                scope = PostReadCacheInvalidationScope.DetailOnly,
                evictReason = "test-detail-clear",
            ),
        ) {
            callbackCalls += Unit
        }

        // then
        assertThat(callbackCalls).isEmpty()
        assertThat(get(PostQueryCacheNames.FEED, "page=1:size=30:sort=CREATED_AT")).isEqualTo("cached")
        assertThat(get(PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT, 101L)).isNull()
        assertThat(get(PostQueryCacheNames.DETAIL_PUBLIC_META, 101L)).isNull()
        assertThat(get(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT, 101L)).isNull()
        assertThat(get(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE, 101L)).isNull()
    }

    @Test
    @DisplayName("작성자 표시 변경은 공개 응답 캐시를 전체 clear한다")
    fun invalidateAuthorRepresentationClearsPublicResponseCaches() {
        // given
        put(PostQueryCacheNames.ADMIN_POSTS_FIRST_PAGE, "page=3:size=20:sort=CREATED_AT")
        put(PostQueryCacheNames.FEED, "page=9:size=99:sort=CREATED_AT")
        put(PostQueryCacheNames.EXPLORE, "page=4:size=15:sort=CREATED_AT:kw=_:tag=spring")
        put(PostQueryCacheNames.FEED_CURSOR_FIRST, "size=45:sort=CREATED_AT")
        put(PostQueryCacheNames.EXPLORE_CURSOR_FIRST, "size=45:sort=CREATED_AT:tag=kotlin")
        put(PostQueryCacheNames.BOOTSTRAP, PostPublicReadQueryService.buildBootstrapCacheKey(45, PostSearchSortType1.CREATED_AT, "Kotlin"))
        put(PostQueryCacheNames.SEARCH, "page=2:size=25:sort=CREATED_AT:kw=author")
        put(PostQueryCacheNames.SEARCH_NEGATIVE, "page=2:size=25:sort=CREATED_AT:kw=missing")
        put(PostQueryCacheNames.TAGS, "public")
        put(PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT, 201L)
        put(PostQueryCacheNames.DETAIL_PUBLIC_META, 201L)
        put(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT, 201L)
        put(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE, 201L)

        // when
        invalidator.invalidateAuthorRepresentation("test-author")

        // then
        assertThat(get(PostQueryCacheNames.ADMIN_POSTS_FIRST_PAGE, "page=3:size=20:sort=CREATED_AT")).isNull()
        assertThat(get(PostQueryCacheNames.FEED, "page=9:size=99:sort=CREATED_AT")).isNull()
        assertThat(get(PostQueryCacheNames.EXPLORE, "page=4:size=15:sort=CREATED_AT:kw=_:tag=spring")).isNull()
        assertThat(get(PostQueryCacheNames.FEED_CURSOR_FIRST, "size=45:sort=CREATED_AT")).isNull()
        assertThat(get(PostQueryCacheNames.EXPLORE_CURSOR_FIRST, "size=45:sort=CREATED_AT:tag=kotlin")).isNull()
        assertThat(
            get(
                PostQueryCacheNames.BOOTSTRAP,
                PostPublicReadQueryService.buildBootstrapCacheKey(45, PostSearchSortType1.CREATED_AT, "Kotlin"),
            ),
        ).isNull()
        assertThat(get(PostQueryCacheNames.SEARCH, "page=2:size=25:sort=CREATED_AT:kw=author")).isNull()
        assertThat(get(PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT, 201L)).isNull()
        assertThat(get(PostQueryCacheNames.DETAIL_PUBLIC_META, 201L)).isNull()
        assertThat(get(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT, 201L)).isNull()
        assertThat(get(PostQueryCacheNames.SEARCH_NEGATIVE, "page=2:size=25:sort=CREATED_AT:kw=missing")).isEqualTo("cached")
        assertThat(get(PostQueryCacheNames.TAGS, "public")).isEqualTo("cached")
        assertThat(get(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE, 201L)).isEqualTo("cached")
    }

    private fun put(
        cacheName: String,
        key: Any,
    ) {
        cacheManager.getCache(cacheName)!!.put(key, "cached")
    }

    private fun get(
        cacheName: String,
        key: Any,
    ): Any? = cacheManager.getCache(cacheName)!!.get(key)?.get()

    private fun newCacheManager(): CacheManager =
        ConcurrentMapCacheManager(
            PostQueryCacheNames.ADMIN_POSTS_FIRST_PAGE,
            PostQueryCacheNames.FEED,
            PostQueryCacheNames.EXPLORE,
            PostQueryCacheNames.FEED_CURSOR_FIRST,
            PostQueryCacheNames.EXPLORE_CURSOR_FIRST,
            PostQueryCacheNames.BOOTSTRAP,
            PostQueryCacheNames.SEARCH,
            PostQueryCacheNames.SEARCH_NEGATIVE,
            PostQueryCacheNames.TAGS,
            PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT,
            PostQueryCacheNames.DETAIL_PUBLIC_META,
            PostQueryCacheNames.DETAIL_PUBLIC_CONTENT,
            PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE,
        )
}
