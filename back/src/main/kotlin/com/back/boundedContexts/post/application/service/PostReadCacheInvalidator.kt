package com.back.boundedContexts.post.application.service

import com.back.standard.dto.post.type1.PostSearchSortType1
import io.micrometer.core.instrument.MeterRegistry
import org.slf4j.LoggerFactory
import org.springframework.cache.Cache
import org.springframework.cache.CacheManager
import org.springframework.data.redis.cache.RedisCache
import org.springframework.data.redis.cache.RedisCacheWriter
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets

internal data class PostReadCacheInvalidationRequest(
    val postId: Long?,
    val beforeTags: Collection<String>,
    val afterTags: Collection<String>,
    val scope: PostReadCacheInvalidationScope,
    val evictReason: String,
)

@Component
class PostReadCacheInvalidator(
    private val cacheManager: CacheManager,
    private val meterRegistry: MeterRegistry? = null,
) {
    private val logger = LoggerFactory.getLogger(PostReadCacheInvalidator::class.java)
    private val rankedSorts =
        listOf(
            PostSearchSortType1.HIT_COUNT,
            PostSearchSortType1.LIKES_COUNT,
        )

    internal fun invalidateRankedSortHotPages(evictReason: String) {
        invalidateRankedSortHotPages(evictReason, rankedSorts)
    }

    internal fun invalidateRankedSortHotPages(
        evictReason: String,
        sorts: Collection<PostSearchSortType1>,
    ) {
        val targetSorts =
            sorts
                .asSequence()
                .filter { it == PostSearchSortType1.HIT_COUNT || it == PostSearchSortType1.LIKES_COUNT }
                .distinct()
                .toList()
        if (targetSorts.isEmpty()) {
            throw IllegalArgumentException("ranked sort invalidation requires HIT_COUNT and/or LIKES_COUNT")
        }

        // targetSorts에 해당하는 ranked 정렬 엔트리만 제거해 CREATED_AT, 기본 BOOTSTRAP, SEARCH_NEGATIVE 캐시를 보존한다.
        listOf(
            PostQueryCacheNames.FEED,
            PostQueryCacheNames.FEED_CURSOR_FIRST,
            PostQueryCacheNames.BOOTSTRAP,
            PostQueryCacheNames.EXPLORE,
            PostQueryCacheNames.EXPLORE_CURSOR_FIRST,
            PostQueryCacheNames.SEARCH,
        ).forEach { cacheName ->
            evictCacheByTargetSorts(
                cache = cacheManager.getCache(cacheName),
                cacheName = cacheName,
                targetSorts = targetSorts,
                evictReason = evictReason,
            )
        }
    }

    private fun evictCacheByTargetSorts(
        cache: Cache?,
        cacheName: String,
        targetSorts: List<PostSearchSortType1>,
        evictReason: String,
    ) {
        if (cache == null) return
        val native = cache.nativeCache
        if (native is MutableMap<*, *>) {
            val iterator = native.keys.iterator()
            while (iterator.hasNext()) {
                val rawKey = iterator.next()?.toString() ?: continue
                if (matchesTargetSort(rawKey, targetSorts)) {
                    iterator.remove()
                    recordCacheEvict(cacheName, "key", evictReason)
                }
            }
            return
        }
        if (cache is RedisCache && native is RedisCacheWriter) {
            val keyPrefix = cache.cacheConfiguration.getKeyPrefixFor(cacheName)
            targetSorts.forEach { sort ->
                native.clean(cacheName, "$keyPrefix*:sort=${sort.name}".toByteArray(StandardCharsets.UTF_8))
                native.clean(cacheName, "$keyPrefix*:sort=${sort.name}:*".toByteArray(StandardCharsets.UTF_8))
                recordCacheEvict(cacheName, "pattern", evictReason)
            }
            return
        }
        cache.clear()
        recordCacheEvict(cacheName, "clear", evictReason)
    }

    private fun matchesTargetSort(
        rawKey: String,
        targetSorts: List<PostSearchSortType1>,
    ): Boolean =
        targetSorts.any { sort ->
            val suffix = ":sort=${sort.name}"
            rawKey.endsWith(suffix) || rawKey.contains("$suffix:")
        }

    internal fun invalidatePublicDetailCounters(
        postId: Long,
        evictReason: String,
    ) {
        listOf(
            PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT,
            PostQueryCacheNames.DETAIL_PUBLIC_META,
        ).forEach { cacheName ->
            cacheManager.getCache(cacheName)?.evict(postId)
            recordCacheEvict(cacheName, "key", evictReason)
        }
    }

    internal fun invalidateAuthorRepresentation(reason: String) {
        listOf(
            PostQueryCacheNames.ADMIN_POSTS_FIRST_PAGE,
            PostQueryCacheNames.FEED,
            PostQueryCacheNames.EXPLORE,
            PostQueryCacheNames.FEED_CURSOR_FIRST,
            PostQueryCacheNames.EXPLORE_CURSOR_FIRST,
            PostQueryCacheNames.BOOTSTRAP,
            PostQueryCacheNames.SEARCH,
            PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT,
            PostQueryCacheNames.DETAIL_PUBLIC_META,
            PostQueryCacheNames.DETAIL_PUBLIC_CONTENT,
        ).forEach { cacheName ->
            cacheManager.getCache(cacheName)?.let { cache ->
                try {
                    cache.clear()
                    recordCacheEvict(cacheName, "clear", reason)
                } catch (exception: RuntimeException) {
                    recordCacheWriteFailure(cacheName, "clear", exception)
                }
            }
        }
    }

    internal fun invalidate(
        request: PostReadCacheInvalidationRequest,
        onPublicTagsEvicted: () -> Unit = {},
    ) {
        if (request.evicts(PostReadCacheInvalidationTarget.PUBLIC_TAGS)) {
            onPublicTagsEvicted()
            recordCacheEvict("local-tag-counts", "clear", request.evictReason)
        }
        if (request.scope.isEmpty()) {
            return
        }
        if (request.evicts(PostReadCacheInvalidationTarget.ADMIN_POSTS_FIRST_PAGE)) {
            cacheManager.getCache(PostQueryCacheNames.ADMIN_POSTS_FIRST_PAGE)?.clear()
            recordCacheEvict(PostQueryCacheNames.ADMIN_POSTS_FIRST_PAGE, "clear", request.evictReason)
        }
        if (
            request.evicts(PostReadCacheInvalidationTarget.HOT_READ_PAGES) ||
            request.evicts(PostReadCacheInvalidationTarget.SEARCH_FIRST_PAGE)
        ) {
            evictHotAndSearchFirstPages(
                includeHotReadPages = request.evicts(PostReadCacheInvalidationTarget.HOT_READ_PAGES),
                includeSearchFirstPage = request.evicts(PostReadCacheInvalidationTarget.SEARCH_FIRST_PAGE),
                evictReason = request.evictReason,
            )
        }

        if (request.evicts(PostReadCacheInvalidationTarget.IMPACTED_TAG_PAGES)) {
            evictImpactedTagPages(request)
        }

        if (request.evicts(PostReadCacheInvalidationTarget.PUBLIC_TAGS)) {
            cacheManager.getCache(PostQueryCacheNames.TAGS)?.evict("public")
            recordCacheEvict(PostQueryCacheNames.TAGS, "key", request.evictReason)
        }
        if (request.evicts(PostReadCacheInvalidationTarget.DETAIL)) {
            evictDetailCaches(request)
        }
    }

    private fun PostReadCacheInvalidationRequest.evicts(target: PostReadCacheInvalidationTarget): Boolean = scope.evicts(target)

    private fun clearRankedInteractionExploreAndSearchCaches(evictReason: String) {
        listOf(
            PostQueryCacheNames.EXPLORE,
            PostQueryCacheNames.EXPLORE_CURSOR_FIRST,
            PostQueryCacheNames.SEARCH,
            PostQueryCacheNames.SEARCH_NEGATIVE,
        ).forEach { cacheName ->
            cacheManager.getCache(cacheName)?.clear()
            recordCacheEvict(cacheName, "clear", evictReason)
        }
    }

    private fun evictHotAndSearchFirstPages(
        includeHotReadPages: Boolean,
        includeSearchFirstPage: Boolean,
        evictReason: String,
    ) {
        if (includeHotReadPages) {
            cacheManager.getCache(PostQueryCacheNames.FEED)?.clear()
            recordCacheEvict(PostQueryCacheNames.FEED, "clear", evictReason)
            cacheManager.getCache(PostQueryCacheNames.EXPLORE)?.clear()
            recordCacheEvict(PostQueryCacheNames.EXPLORE, "clear", evictReason)
            cacheManager.getCache(PostQueryCacheNames.FEED_CURSOR_FIRST)?.clear()
            recordCacheEvict(PostQueryCacheNames.FEED_CURSOR_FIRST, "clear", evictReason)
            cacheManager.getCache(PostQueryCacheNames.EXPLORE_CURSOR_FIRST)?.clear()
            recordCacheEvict(PostQueryCacheNames.EXPLORE_CURSOR_FIRST, "clear", evictReason)
            cacheManager.getCache(PostQueryCacheNames.BOOTSTRAP)?.clear()
            recordCacheEvict(PostQueryCacheNames.BOOTSTRAP, "clear", evictReason)
        }
        if (includeSearchFirstPage) {
            // 검색어별 키는 열거할 수 없으므로 결과와 결과 없음 캐시를 함께 비운다.
            cacheManager.getCache(PostQueryCacheNames.SEARCH)?.clear()
            recordCacheEvict(PostQueryCacheNames.SEARCH, "all", evictReason)
            cacheManager.getCache(PostQueryCacheNames.SEARCH_NEGATIVE)?.clear()
            recordCacheEvict(PostQueryCacheNames.SEARCH_NEGATIVE, "all", evictReason)
        }
    }

    private fun evictImpactedTagPages(request: PostReadCacheInvalidationRequest) {
        cacheManager.getCache(PostQueryCacheNames.EXPLORE)?.clear()
        recordCacheEvict(PostQueryCacheNames.EXPLORE, "clear", request.evictReason)
        cacheManager.getCache(PostQueryCacheNames.EXPLORE_CURSOR_FIRST)?.clear()
        recordCacheEvict(PostQueryCacheNames.EXPLORE_CURSOR_FIRST, "clear", request.evictReason)
        cacheManager.getCache(PostQueryCacheNames.BOOTSTRAP)?.clear()
        recordCacheEvict(PostQueryCacheNames.BOOTSTRAP, "clear", request.evictReason)
    }

    private fun evictDetailCaches(request: PostReadCacheInvalidationRequest) {
        val postId = request.postId
        listOf(
            PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT,
            PostQueryCacheNames.DETAIL_PUBLIC_META,
            PostQueryCacheNames.DETAIL_PUBLIC_CONTENT,
            PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE,
        ).forEach { cacheName ->
            val cache = cacheManager.getCache(cacheName)
            if (postId == null) {
                cache?.clear()
                recordCacheEvict(cacheName, "clear", request.evictReason)
            } else {
                cache?.evict(postId)
                recordCacheEvict(cacheName, "key", request.evictReason)
            }
        }
    }

    private fun recordCacheEvict(
        cacheName: String,
        scope: String,
        reason: String,
    ) {
        meterRegistry?.counter("post.read.cache.evict", "cache", cacheName, "scope", scope, "reason", reason)?.increment()
    }

    private fun recordCacheWriteFailure(
        cacheName: String,
        operation: String,
        exception: RuntimeException,
    ) {
        meterRegistry
            ?.counter("post.read.cache.write.failure", "cache", cacheName, "operation", operation)
            ?.increment()
        logger.warn("Cache write failed (cache={}, operation={})", cacheName, operation, exception)
    }
}
