package com.back.boundedContexts.post.application.service

import com.back.standard.dto.post.type1.PostSearchSortType1
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.cache.Cache
import org.springframework.cache.CacheManager
import org.springframework.stereotype.Component

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
    private val hotPageSizes = listOf(30, 24, 16)
    private val hotSorts = listOf(PostSearchSortType1.CREATED_AT)
    private val maxTagCacheEvict = 12

    internal fun invalidate(
        request: PostReadCacheInvalidationRequest,
        onPublicTagsEvicted: () -> Unit,
    ) {
        if (request.evicts(PostReadCacheInvalidationTarget.PUBLIC_TAGS)) {
            onPublicTagsEvicted()
            recordCacheEvict("local-tag-counts", "clear", request.evictReason)
        }
        if (request.scope.isEmpty()) {
            return
        }
        val feedCache = cacheManager.getCache(PostQueryCacheNames.FEED)
        val exploreCache = cacheManager.getCache(PostQueryCacheNames.EXPLORE)
        val adminPostsFirstPageCache = cacheManager.getCache(PostQueryCacheNames.ADMIN_POSTS_FIRST_PAGE)
        val feedCursorFirstCache = cacheManager.getCache(PostQueryCacheNames.FEED_CURSOR_FIRST)
        val exploreCursorFirstCache = cacheManager.getCache(PostQueryCacheNames.EXPLORE_CURSOR_FIRST)
        val bootstrapCache = cacheManager.getCache(PostQueryCacheNames.BOOTSTRAP)
        val searchCache = cacheManager.getCache(PostQueryCacheNames.SEARCH)
        val searchNegativeCache = cacheManager.getCache(PostQueryCacheNames.SEARCH_NEGATIVE)
        val tagsCache = cacheManager.getCache(PostQueryCacheNames.TAGS)

        if (
            request.evicts(PostReadCacheInvalidationTarget.HOT_READ_PAGES) ||
            request.evicts(PostReadCacheInvalidationTarget.SEARCH_FIRST_PAGE)
        ) {
            adminPostsFirstPageCache?.evict("page=1:size=20:sort=${PostSearchSortType1.CREATED_AT.name}")
            recordCacheEvict(PostQueryCacheNames.ADMIN_POSTS_FIRST_PAGE, "key", request.evictReason)
            hotPageSizes.forEach { pageSize ->
                hotSorts.forEach { sort ->
                    val sortName = sort.name
                    if (request.evicts(PostReadCacheInvalidationTarget.HOT_READ_PAGES)) {
                        feedCache?.evict("page=1:size=$pageSize:sort=$sortName")
                        recordCacheEvict(PostQueryCacheNames.FEED, "key", request.evictReason)
                        exploreCache?.evict("page=1:size=$pageSize:sort=$sortName:kw=_:tag=_")
                        recordCacheEvict(PostQueryCacheNames.EXPLORE, "key", request.evictReason)
                        feedCursorFirstCache?.evict("size=$pageSize:sort=$sortName")
                        recordCacheEvict(PostQueryCacheNames.FEED_CURSOR_FIRST, "key", request.evictReason)
                        exploreCursorFirstCache?.evict("size=$pageSize:sort=$sortName:tag=_")
                        recordCacheEvict(PostQueryCacheNames.EXPLORE_CURSOR_FIRST, "key", request.evictReason)
                        bootstrapCache?.evict(
                            PostPublicReadQueryService.buildBootstrapCacheKey(
                                pageSize = pageSize,
                                sort = sort,
                                tag = "",
                            ),
                        )
                        recordCacheEvict(PostQueryCacheNames.BOOTSTRAP, "key", request.evictReason)
                    }
                    if (request.evicts(PostReadCacheInvalidationTarget.SEARCH_FIRST_PAGE)) {
                        searchCache?.evict("page=1:size=$pageSize:sort=$sortName:kw=_")
                        recordCacheEvict(PostQueryCacheNames.SEARCH, "key", request.evictReason)
                        searchNegativeCache?.evict("page=1:size=$pageSize:sort=$sortName:kw=_")
                        recordCacheEvict(PostQueryCacheNames.SEARCH_NEGATIVE, "key", request.evictReason)
                    }
                }
            }
        }

        if (request.evicts(PostReadCacheInvalidationTarget.IMPACTED_TAG_PAGES)) {
            evictImpactedTagPages(request, exploreCache, exploreCursorFirstCache, bootstrapCache)
        }

        if (request.evicts(PostReadCacheInvalidationTarget.PUBLIC_TAGS)) {
            tagsCache?.evict("public")
            recordCacheEvict(PostQueryCacheNames.TAGS, "key", request.evictReason)
        }
        if (request.evicts(PostReadCacheInvalidationTarget.DETAIL)) {
            evictDetailCaches(request)
        }
    }

    private fun PostReadCacheInvalidationRequest.evicts(target: PostReadCacheInvalidationTarget): Boolean = scope.evicts(target)

    private fun evictImpactedTagPages(
        request: PostReadCacheInvalidationRequest,
        exploreCache: Cache?,
        exploreCursorFirstCache: Cache?,
        bootstrapCache: Cache?,
    ) {
        val impactedTagTokens =
            buildList(request.beforeTags.size + request.afterTags.size) {
                addAll(request.beforeTags)
                addAll(request.afterTags)
            }.asSequence()
                .map(String::trim)
                .filter(String::isNotBlank)
                .map(PostPublicReadQueryService::toCacheKeyToken)
                .distinct()
                .take(maxTagCacheEvict)
                .toList()

        impactedTagTokens.forEach { token ->
            hotPageSizes.forEach { pageSize ->
                hotSorts.forEach { sort ->
                    val sortName = sort.name
                    exploreCache?.evict("page=1:size=$pageSize:sort=$sortName:kw=_:tag=$token")
                    recordCacheEvict(PostQueryCacheNames.EXPLORE, "key", request.evictReason)
                    exploreCursorFirstCache?.evict("size=$pageSize:sort=$sortName:tag=$token")
                    recordCacheEvict(PostQueryCacheNames.EXPLORE_CURSOR_FIRST, "key", request.evictReason)
                }
            }
        }

        buildList(request.beforeTags.size + request.afterTags.size) {
            addAll(request.beforeTags)
            addAll(request.afterTags)
        }.asSequence()
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
            .take(maxTagCacheEvict)
            .forEach { rawTag ->
                hotPageSizes.forEach { pageSize ->
                    hotSorts.forEach { sort ->
                        bootstrapCache?.evict(
                            PostPublicReadQueryService.buildBootstrapCacheKey(
                                pageSize = pageSize,
                                sort = sort,
                                tag = rawTag,
                            ),
                        )
                        recordCacheEvict(PostQueryCacheNames.BOOTSTRAP, "key", request.evictReason)
                    }
                }
            }
    }

    private fun evictDetailCaches(request: PostReadCacheInvalidationRequest) {
        val detailSnapshotCache = cacheManager.getCache(PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT)
        val detailMetaCache = cacheManager.getCache(PostQueryCacheNames.DETAIL_PUBLIC_META)
        val detailContentCache = cacheManager.getCache(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT)
        val detailNegativeCache = cacheManager.getCache(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE)
        if (request.postId == null) {
            detailSnapshotCache?.clear()
            recordCacheEvict(PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT, "clear", request.evictReason)
            detailMetaCache?.clear()
            recordCacheEvict(PostQueryCacheNames.DETAIL_PUBLIC_META, "clear", request.evictReason)
            detailContentCache?.clear()
            recordCacheEvict(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT, "clear", request.evictReason)
            detailNegativeCache?.clear()
            recordCacheEvict(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE, "clear", request.evictReason)
        } else {
            detailSnapshotCache?.evict(request.postId)
            recordCacheEvict(PostQueryCacheNames.DETAIL_PUBLIC_SNAPSHOT, "key", request.evictReason)
            detailMetaCache?.evict(request.postId)
            recordCacheEvict(PostQueryCacheNames.DETAIL_PUBLIC_META, "key", request.evictReason)
            detailContentCache?.evict(request.postId)
            recordCacheEvict(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT, "key", request.evictReason)
            detailNegativeCache?.evict(request.postId)
            recordCacheEvict(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE, "key", request.evictReason)
        }
    }

    private fun recordCacheEvict(
        cacheName: String,
        scope: String,
        reason: String,
    ) {
        meterRegistry?.counter("post.read.cache.evict", "cache", cacheName, "scope", scope, "reason", reason)?.increment()
    }
}
