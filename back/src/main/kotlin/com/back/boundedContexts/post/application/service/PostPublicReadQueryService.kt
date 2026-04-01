package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.input.PostPublicReadQueryUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.CursorFeedPageDto
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.PublicPostDetailContentCacheDto
import com.back.boundedContexts.post.dto.PublicPostDetailMetaCacheDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.global.exception.application.AppException
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Tag
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.cache.CacheManager
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.math.max

/**
 * PostPublicReadQueryService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class PostPublicReadQueryService(
    private val postUseCase: PostUseCase,
    private val postReadBulkheadService: PostReadBulkheadService,
    private val cacheManager: CacheManager,
    private val meterRegistry: MeterRegistry? = null,
    @Value("\${custom.post.read.cursor-signing-secret:}") cursorSigningSecret: String,
    @Value("\${custom.post.read.detail-content-cache-max-chars:120000}") detailContentCacheMaxChars: Int,
) : PostPublicReadQueryUseCase {
    private val logger = LoggerFactory.getLogger(PostPublicReadQueryService::class.java)
    private val cursorSecretBytes = resolveCursorSecret(cursorSigningSecret).toByteArray(StandardCharsets.UTF_8)
    private val detailContentCacheLimit = detailContentCacheMaxChars.coerceAtLeast(2_048)
    private val detailCacheLockRegistry = ConcurrentHashMap<Long, Any>()
    private val cachePayloadMaxBytes = ConcurrentHashMap<String, AtomicLong>()

    init {
        if (cursorSigningSecret.isBlank()) {
            logger.warn(
                "cursor_signing_secret_not_set: fallback secret is in use. set custom.post.read.cursor-signing-secret in production",
            )
        }
    }

    @Transactional(readOnly = true)
    @Cacheable(
        cacheNames = [PostQueryCacheNames.FEED],
        key = "'page=' + #page + ':size=' + #pageSize + ':sort=' + #sort.name()",
        sync = true,
    )
    override fun getPublicFeed(
        page: Int,
        pageSize: Int,
        sort: PostSearchSortType1,
    ): PageDto<FeedPostDto> =
        runReadQuery("feed", "page=$page size=$pageSize sort=${sort.name}") {
            postReadBulkheadService.withFeedPermit {
                toFeedPostDtoPage(
                    postUseCase.findPagedByKw("", sort, page, pageSize),
                )
            }
        }

    @Transactional(readOnly = true)
    @Cacheable(
        cacheNames = [PostQueryCacheNames.FEED_CURSOR_FIRST],
        key = "'size=' + #pageSize + ':sort=' + #sort.name()",
        condition =
            "T(com.back.boundedContexts.post.application.service.PostPublicReadQueryService)" +
                ".isFirstCursorRequest(#cursor)",
        sync = true,
    )
    override fun getPublicFeedByCursor(
        cursor: String?,
        pageSize: Int,
        sort: PostSearchSortType1,
    ): CursorFeedPageDto =
        runReadQuery(
            "feed-cursor",
            "pageSize=$pageSize sort=${sort.name} cursor=${cursor?.take(80) ?: "_"}",
        ) {
            postReadBulkheadService.withFeedPermit {
                val safeSort = requireCursorSort(sort)
                val safePageSize = pageSize.coerceIn(1, MAX_CURSOR_PAGE_SIZE)
                val parsedCursor = parseCursor(cursor)
                val rows =
                    postUseCase.findPublicByCursor(
                        cursorCreatedAt = parsedCursor?.createdAt,
                        cursorId = parsedCursor?.id,
                        limit = safePageSize + 1,
                        sort = safeSort,
                    )
                toCursorFeedPageDto(rows, safePageSize)
            }
        }

    @Transactional(readOnly = true)
    @Cacheable(
        cacheNames = [PostQueryCacheNames.EXPLORE],
        key =
            "'page=' + #page + ':size=' + #pageSize + ':sort=' + #sort.name()" +
                " + ':kw=' + T(com.back.boundedContexts.post.application.service.PostPublicReadQueryService).toCacheKeyToken(#kw)" +
                " + ':tag=' + T(com.back.boundedContexts.post.application.service.PostPublicReadQueryService).toCacheKeyToken(#tag)",
        condition =
            "!T(com.back.boundedContexts.post.application.service.PostPublicReadQueryService)" +
                ".shouldBypassExploreCache(#page, #kw, #tag)",
        sync = true,
    )
    override fun getPublicExplore(
        page: Int,
        pageSize: Int,
        kw: String,
        tag: String,
        sort: PostSearchSortType1,
    ): PageDto<FeedPostDto> =
        runReadQuery(
            "explore",
            "page=$page size=$pageSize sort=${sort.name} kw=${kw.trim().take(80)} tag=${tag.trim().take(80)}",
        ) {
            postReadBulkheadService.withExplorePermit {
                val normalizedKw = kw.trim()
                val normalizedTag = tag.trim()
                val postPage =
                    if (normalizedTag.isBlank()) {
                        if (normalizedKw.isBlank() && sort == PostSearchSortType1.CREATED_AT) {
                            postUseCase.findRecommendedExplorePage(page, pageSize)
                        } else {
                            postUseCase.findPagedByKw(normalizedKw, sort, page, pageSize)
                        }
                    } else {
                        postUseCase.findPagedByKwAndTag(normalizedKw, normalizedTag, sort, page, pageSize)
                    }
                toFeedPostDtoPage(postPage)
            }
        }

    @Transactional(readOnly = true)
    @Cacheable(
        cacheNames = [PostQueryCacheNames.EXPLORE_CURSOR_FIRST],
        key =
            "'size=' + #pageSize + ':sort=' + #sort.name()" +
                " + ':tag=' + T(com.back.boundedContexts.post.application.service.PostPublicReadQueryService).toCacheKeyToken(#tag)",
        condition =
            "T(com.back.boundedContexts.post.application.service.PostPublicReadQueryService)" +
                ".isFirstCursorRequest(#cursor) && #tag.trim().length() > 0",
        sync = true,
    )
    override fun getPublicExploreByCursor(
        cursor: String?,
        pageSize: Int,
        tag: String,
        sort: PostSearchSortType1,
    ): CursorFeedPageDto =
        runReadQuery(
            "explore-cursor",
            "pageSize=$pageSize sort=${sort.name} tag=${tag.take(80)} cursor=${cursor?.take(80) ?: "_"}",
        ) {
            postReadBulkheadService.withExplorePermit {
                val safeSort = requireCursorSort(sort)
                val safePageSize = pageSize.coerceIn(1, MAX_CURSOR_PAGE_SIZE)
                val normalizedTag = tag.trim()
                if (normalizedTag.isBlank()) {
                    throw AppException("400-1", "태그 커서 탐색에는 tag 파라미터가 필요합니다.")
                }
                val parsedCursor = parseCursor(cursor)
                val rows =
                    postUseCase.findPublicByTagCursor(
                        tag = normalizedTag,
                        cursorCreatedAt = parsedCursor?.createdAt,
                        cursorId = parsedCursor?.id,
                        limit = safePageSize + 1,
                        sort = safeSort,
                    )
                toCursorFeedPageDto(rows, safePageSize)
            }
        }

    @Transactional(readOnly = true)
    @Cacheable(
        cacheNames = [PostQueryCacheNames.SEARCH],
        key =
            "'page=' + #page + ':size=' + #pageSize + ':sort=' + #sort.name()" +
                " + ':kw=' + T(com.back.boundedContexts.post.application.service.PostPublicReadQueryService).toCacheKeyToken(#kw)",
        condition =
            "#kw.trim().length() > 0 && !T(com.back.boundedContexts.post.application.service.PostPublicReadQueryService)" +
                ".shouldBypassSearchCache(#page, #kw)",
        sync = true,
    )
    override fun getPublicSearch(
        page: Int,
        pageSize: Int,
        kw: String,
        sort: PostSearchSortType1,
    ): PageDto<FeedPostDto> =
        runReadQuery(
            "search",
            "page=$page size=$pageSize sort=${sort.name} kw=${kw.trim().take(80)}",
        ) {
            postReadBulkheadService.withSearchPermit {
                if (isSearchNegativeCached(page, pageSize, sort, kw)) {
                    return@withSearchPermit PageDto(PagedResult(emptyList(), page, pageSize, 0))
                }
                val pageDto =
                    toFeedPostDtoPage(
                        postUseCase.findPagedByKw(kw, sort, page, pageSize),
                    )
                if (shouldCacheSearchNegative(page, kw) && pageDto.content.isEmpty()) {
                    cacheManager
                        .getCache(PostQueryCacheNames.SEARCH_NEGATIVE)
                        ?.put(buildSearchCacheKey(page, pageSize, sort, kw), true)
                    recordCacheResult(PostQueryCacheNames.SEARCH_NEGATIVE, "put")
                } else if (pageDto.content.isNotEmpty()) {
                    cacheManager
                        .getCache(PostQueryCacheNames.SEARCH_NEGATIVE)
                        ?.evict(buildSearchCacheKey(page, pageSize, sort, kw))
                }
                pageDto
            }
        }

    @Transactional(readOnly = true)
    override fun getPublicPostDetail(id: Long): PostWithContentDto =
        runReadQuery("detail", "id=$id") {
            postReadBulkheadService.withDetailPermit {
                if (isDetailNegativeCached(id)) {
                    throw AppException("404-1", "존재하지 않는 글입니다.")
                }
                val meta = getCachedPublicPostDetailMeta(id)
                val content = getOrLoadPublicPostDetailContent(id)
                clearDetailNegativeCache(id)
                meta.merge(content)
            }
        }

    @Transactional(readOnly = true)
    override fun getPublicRelatedByAuthor(
        authorId: Long,
        excludePostId: Long?,
        limit: Int,
    ): List<FeedPostDto> =
        runReadQuery(
            "related-author",
            "authorId=$authorId excludePostId=${excludePostId ?: "_"} limit=$limit",
        ) {
            postReadBulkheadService.withExplorePermit {
                postUseCase
                    .findPublicByAuthorExceptPost(
                        authorId = authorId,
                        excludePostId = excludePostId,
                        limit = limit.coerceIn(1, 12),
                    ).map(FeedPostDto::from)
            }
        }

    @Transactional(readOnly = true)
    @Cacheable(cacheNames = [PostQueryCacheNames.TAGS], key = "'public'", sync = true)
    override fun getPublicTagCounts(): List<TagCountDto> =
        runReadQuery("tags", "public=true") {
            postReadBulkheadService.withTagsPermit {
                postUseCase.getPublicTagCounts()
            }
        }

    private fun <T> runReadQuery(
        endpoint: String,
        detail: String,
        block: () -> T,
    ): T {
        val startedAt = System.nanoTime()
        val metricEndpoint = endpoint.trim().ifBlank { "unknown" }.take(40)
        try {
            val result = block()
            meterRegistry
                ?.timer("post.read.endpoint.duration", "endpoint", metricEndpoint, "status", "success")
                ?.record(System.nanoTime() - startedAt, TimeUnit.NANOSECONDS)
            return result
        } catch (exception: Exception) {
            val safeEndpoint =
                endpoint
                    .replace('\r', ' ')
                    .replace('\n', ' ')
                    .replace('\t', ' ')
                    .trim()
                    .take(MAX_LOG_FIELD_LENGTH)
            val safeDetail =
                detail
                    .replace('\r', ' ')
                    .replace('\n', ' ')
                    .replace('\t', ' ')
                    .trim()
                    .take(MAX_LOG_FIELD_LENGTH)
            logger.error(
                "post_public_read_failed endpoint={} detail={} exception={}",
                safeEndpoint,
                safeDetail,
                exception::class.java.simpleName,
                exception,
            )
            meterRegistry
                ?.timer("post.read.endpoint.duration", "endpoint", metricEndpoint, "status", "failed")
                ?.record(System.nanoTime() - startedAt, TimeUnit.NANOSECONDS)
            throw exception
        }
    }

    private fun isSearchNegativeCached(
        page: Int,
        pageSize: Int,
        sort: PostSearchSortType1,
        kw: String,
    ): Boolean {
        if (!shouldCacheSearchNegative(page, kw)) return false
        val cacheKey = buildSearchCacheKey(page, pageSize, sort, kw)
        val cached =
            readNegativeCacheFlag(
                cacheName = PostQueryCacheNames.SEARCH_NEGATIVE,
                cacheKey = cacheKey,
            )
        recordCacheResult(PostQueryCacheNames.SEARCH_NEGATIVE, if (cached) "hit" else "miss")
        return cached
    }

    private fun shouldCacheSearchNegative(
        page: Int,
        kw: String,
    ): Boolean = page == 1 && !shouldBypassSearchCache(page, kw)

    private fun buildSearchCacheKey(
        page: Int,
        pageSize: Int,
        sort: PostSearchSortType1,
        kw: String,
    ): String = "page=$page:size=$pageSize:sort=${sort.name}:kw=${toCacheKeyToken(kw)}"

    private fun isDetailNegativeCached(id: Long): Boolean {
        val cached =
            readNegativeCacheFlag(
                cacheName = PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE,
                cacheKey = id,
            )
        recordCacheResult(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE, if (cached) "hit" else "miss")
        return cached
    }

    private fun markDetailNegativeCache(id: Long) {
        cacheManager
            .getCache(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE)
            ?.put(id, true)
        recordCacheResult(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE, "put")
    }

    private fun clearDetailNegativeCache(id: Long) {
        cacheManager
            .getCache(PostQueryCacheNames.DETAIL_PUBLIC_NEGATIVE)
            ?.evict(id)
    }

    /**
     * 음수 캐시는 "true" 센티널만 유효값으로 인정한다.
     * 배포/직렬화 정책 전환으로 타입이 달라도 500으로 전파하지 않고 miss+evict로 복구한다.
     */
    private fun readNegativeCacheFlag(
        cacheName: String,
        cacheKey: Any,
    ): Boolean {
        val cache = cacheManager.getCache(cacheName) ?: return false
        return try {
            val rawValue = cache.get(cacheKey)?.get() ?: return false
            if (rawValue.toBooleanSentinel() == true) {
                true
            } else {
                logger.warn(
                    "negative_cache_value_mismatch cache={} key={} valueType={} value={} -> evict",
                    cacheName,
                    sanitizeLogField(cacheKey.toString(), MAX_CACHE_KEY_LOG_LENGTH),
                    rawValue::class.java.name,
                    sanitizeLogField(rawValue.toString(), MAX_CACHE_VALUE_LOG_LENGTH),
                )
                cache.evict(cacheKey)
                recordCacheResult(cacheName, "evict_mismatch")
                false
            }
        } catch (exception: RuntimeException) {
            logger.warn(
                "negative_cache_read_failed cache={} key={} -> fallback miss",
                cacheName,
                sanitizeLogField(cacheKey.toString(), MAX_CACHE_KEY_LOG_LENGTH),
                exception,
            )
            runCatching { cache.evict(cacheKey) }
            recordCacheResult(cacheName, "evict_error")
            false
        }
    }

    private fun Any.toBooleanSentinel(): Boolean? =
        when (this) {
            is Boolean -> this
            is String ->
                when (this.trim().lowercase()) {
                    "true",
                    "1",
                    "yes",
                    "y",
                    "on",
                    -> true
                    "false",
                    "0",
                    "no",
                    "n",
                    "off",
                    -> false
                    else -> null
                }
            is Number -> this.toInt() != 0
            else -> null
        }

    private fun sanitizeLogField(
        value: String,
        maxLength: Int,
    ): String =
        value
            .replace('\r', ' ')
            .replace('\n', ' ')
            .replace('\t', ' ')
            .trim()
            .take(maxLength)

    private fun getOrLoadPublicPostDetailContent(id: Long): PublicPostDetailContentCacheDto {
        val cached =
            cacheManager
                .getCache(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT)
                ?.get(id, PublicPostDetailContentCacheDto::class.java)
        if (cached != null) {
            recordCacheResult(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT, "hit")
            return cached
        }
        recordCacheResult(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT, "miss")

        return withDetailCacheLock(id) {
            val contentCache = cacheManager.getCache(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT)
            val doubleChecked = contentCache?.get(id, PublicPostDetailContentCacheDto::class.java)
            if (doubleChecked != null) {
                recordCacheResult(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT, "hit")
                return@withDetailCacheLock doubleChecked
            }

            val loaded =
                postUseCase.findPublicDetailContentById(id)
                    ?: run {
                        markDetailNegativeCache(id)
                        throw AppException("404-1", "존재하지 않는 글입니다.")
                    }

            if (shouldCacheDetailContent(loaded)) {
                contentCache?.put(id, loaded)
                recordCacheResult(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT, "put")
                recordCachePayloadSize(
                    PostQueryCacheNames.DETAIL_PUBLIC_CONTENT,
                    loaded.content.length + (loaded.contentHtml?.length ?: 0),
                )
            } else {
                recordCacheResult(PostQueryCacheNames.DETAIL_PUBLIC_CONTENT, "skip_large")
            }
            loaded
        }
    }

    private fun shouldCacheDetailContent(content: PublicPostDetailContentCacheDto): Boolean {
        val plainLength = content.content.length
        val htmlLength = content.contentHtml?.length ?: 0
        val totalLength = plainLength + htmlLength
        return totalLength <= detailContentCacheLimit
    }

    private fun getCachedPublicPostDetailMeta(id: Long): PublicPostDetailMetaCacheDto {
        val cached =
            cacheManager
                .getCache(PostQueryCacheNames.DETAIL_PUBLIC_META)
                ?.get(id, PublicPostDetailMetaCacheDto::class.java)
        if (cached != null) {
            recordCacheResult(PostQueryCacheNames.DETAIL_PUBLIC_META, "hit")
            return cached
        }
        recordCacheResult(PostQueryCacheNames.DETAIL_PUBLIC_META, "miss")

        return withDetailCacheLock(id) {
            val metaCache = cacheManager.getCache(PostQueryCacheNames.DETAIL_PUBLIC_META)
            val doubleChecked = metaCache?.get(id, PublicPostDetailMetaCacheDto::class.java)
            if (doubleChecked != null) {
                recordCacheResult(PostQueryCacheNames.DETAIL_PUBLIC_META, "hit")
                return@withDetailCacheLock doubleChecked
            }

            val post =
                postUseCase.findPublicDetailById(id)
                    ?: run {
                        markDetailNegativeCache(id)
                        throw AppException("404-1", "존재하지 않는 글입니다.")
                    }
            post.checkActorCanRead(null)
            val loaded = PublicPostDetailMetaCacheDto.from(PostWithContentDto(post))
            metaCache?.put(id, loaded)
            recordCacheResult(PostQueryCacheNames.DETAIL_PUBLIC_META, "put")
            recordCachePayloadSize(PostQueryCacheNames.DETAIL_PUBLIC_META, estimateDetailMetaPayloadSize(loaded))
            loaded
        }
    }

    private fun <T> withDetailCacheLock(
        id: Long,
        supplier: () -> T,
    ): T {
        val lock = detailCacheLockRegistry.computeIfAbsent(id) { Any() }
        return try {
            synchronized(lock) {
                supplier()
            }
        } finally {
            detailCacheLockRegistry.remove(id, lock)
        }
    }

    private fun recordCacheResult(
        cacheName: String,
        result: String,
    ) {
        meterRegistry?.counter("post.read.cache.result", "cache", cacheName, "result", result)?.increment()
    }

    private fun recordCachePayloadSize(
        cacheName: String,
        bytes: Int,
    ) {
        val safeBytes = bytes.coerceAtLeast(0)
        meterRegistry?.summary("post.read.cache.payload.bytes", "cache", cacheName)?.record(safeBytes.toDouble())
        val maxRef =
            cachePayloadMaxBytes.computeIfAbsent(cacheName) {
                val ref = AtomicLong(0)
                val tags = listOf(Tag.of("cache", cacheName))
                meterRegistry?.gauge(
                    "post.read.cache.payload.max.bytes",
                    tags,
                    ref,
                )
                ref
            }
        maxRef.accumulateAndGet(safeBytes.toLong()) { prev, current -> max(prev, current) }
    }

    private fun estimateDetailMetaPayloadSize(meta: PublicPostDetailMetaCacheDto): Int =
        meta.title.length +
            meta.authorName.length +
            meta.authorUsername.length +
            meta.authorProfileImageUrl.length +
            meta.authorProfileImageDirectUrl.length +
            128

    private fun toFeedPostDtoPage(postPage: PagedResult<com.back.boundedContexts.post.domain.Post>): PageDto<FeedPostDto> =
        PageDto(postPage.map(FeedPostDto::from))

    private fun toCursorFeedPageDto(
        rows: List<com.back.boundedContexts.post.domain.Post>,
        pageSize: Int,
    ): CursorFeedPageDto {
        if (rows.isEmpty()) {
            return CursorFeedPageDto(
                content = emptyList(),
                pageSize = pageSize,
                hasNext = false,
                nextCursor = null,
            )
        }

        val hasNext = rows.size > pageSize
        val currentRows = if (hasNext) rows.take(pageSize) else rows
        val last = currentRows.last()
        val nextCursor = if (hasNext) encodeCursor(last.createdAt, last.id) else null

        return CursorFeedPageDto(
            content = currentRows.map(FeedPostDto::from),
            pageSize = pageSize,
            hasNext = hasNext,
            nextCursor = nextCursor,
        )
    }

    private fun requireCursorSort(sort: PostSearchSortType1): PostSearchSortType1 {
        if (sort == PostSearchSortType1.CREATED_AT || sort == PostSearchSortType1.CREATED_AT_ASC) {
            return sort
        }
        throw AppException("400-1", "커서 조회는 CREATED_AT 정렬만 지원합니다.")
    }

    private fun parseCursor(raw: String?): CursorToken? {
        val value = raw?.trim().orEmpty()
        if (value.isBlank()) return null
        val parts = value.split(":", limit = 3)
        if (parts.size != 3) {
            throw AppException("400-1", "cursor 형식이 올바르지 않습니다.")
        }

        val epochMillis =
            parts[0].toLongOrNull()
                ?: throw AppException("400-1", "cursor timestamp 형식이 올바르지 않습니다.")
        val id =
            parts[1].toLongOrNull()
                ?: throw AppException("400-1", "cursor id 형식이 올바르지 않습니다.")
        if (epochMillis < 0 || id <= 0L) {
            throw AppException("400-1", "cursor 값이 유효하지 않습니다.")
        }

        val signature = parts[2].trim()
        if (signature.isBlank()) {
            throw AppException("400-1", "cursor 서명이 비어 있습니다.")
        }
        val payload = "$epochMillis:$id"
        val expectedSignature = signCursorPayload(payload)
        val isSignatureValid =
            MessageDigest.isEqual(
                expectedSignature.toByteArray(StandardCharsets.UTF_8),
                signature.toByteArray(StandardCharsets.UTF_8),
            )
        if (!isSignatureValid) {
            throw AppException("400-1", "cursor 서명이 유효하지 않습니다.")
        }

        return CursorToken(Instant.ofEpochMilli(epochMillis), id)
    }

    private fun encodeCursor(
        createdAt: Instant,
        id: Long,
    ): String {
        val payload = "${createdAt.toEpochMilli()}:$id"
        return "$payload:${signCursorPayload(payload)}"
    }

    private fun signCursorPayload(payload: String): String {
        val mac = Mac.getInstance(CURSOR_HMAC_ALGORITHM)
        mac.init(SecretKeySpec(cursorSecretBytes, CURSOR_HMAC_ALGORITHM))
        val digest = mac.doFinal(payload.toByteArray(StandardCharsets.UTF_8))
        val truncated = digest.copyOf(CURSOR_SIGNATURE_BYTES)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(truncated)
    }

    private fun resolveCursorSecret(raw: String): String = raw.ifBlank { DEFAULT_CURSOR_SIGNING_SECRET }

    companion object {
        @JvmStatic
        fun normalizeCacheToken(raw: String): String =
            raw
                .trim()
                .replace(Regex("\\s+"), " ")
                .lowercase()

        @JvmStatic
        fun toCacheKeyToken(raw: String): String {
            val normalized = normalizeCacheToken(raw)
            if (normalized.isBlank()) return "_"
            if (normalized.length <= CACHE_KEY_DIRECT_MAX_LENGTH) return normalized
            return "__h:${sha256Hex(normalized).take(CACHE_KEY_HASH_LENGTH)}"
        }

        @JvmStatic
        fun shouldBypassExploreCache(
            page: Int,
            kw: String,
            tag: String,
        ): Boolean {
            val normalizedKw = normalizeCacheToken(kw)
            val normalizedTag = normalizeCacheToken(tag)
            return page > MAX_CACHEABLE_PAGE ||
                normalizedKw.length > MAX_CACHEABLE_KW_LENGTH ||
                normalizedTag.length > MAX_CACHEABLE_TAG_LENGTH ||
                normalizedKw.length + normalizedTag.length > MAX_CACHEABLE_TOTAL_LENGTH
        }

        @JvmStatic
        fun shouldBypassSearchCache(
            page: Int,
            kw: String,
        ): Boolean {
            val normalizedKw = normalizeCacheToken(kw)
            if (normalizedKw.isBlank()) return true
            return page > MAX_CACHEABLE_PAGE || normalizedKw.length > MAX_CACHEABLE_KW_LENGTH
        }

        @JvmStatic
        fun isFirstCursorRequest(cursor: String?): Boolean = cursor.isNullOrBlank()

        private fun sha256Hex(value: String): String =
            MessageDigest
                .getInstance("SHA-256")
                .digest(value.toByteArray(Charsets.UTF_8))
                .joinToString("") { each -> "%02x".format(each) }

        private const val CACHE_KEY_DIRECT_MAX_LENGTH = 24
        private const val CACHE_KEY_HASH_LENGTH = 24
        private const val MAX_CACHEABLE_PAGE = 10
        private const val MAX_CACHEABLE_KW_LENGTH = 24
        private const val MAX_CACHEABLE_TAG_LENGTH = 24
        private const val MAX_CACHEABLE_TOTAL_LENGTH = 32
        private const val MAX_LOG_FIELD_LENGTH = 240
        private const val MAX_CACHE_KEY_LOG_LENGTH = 120
        private const val MAX_CACHE_VALUE_LOG_LENGTH = 80
        private const val MAX_CURSOR_PAGE_SIZE = 30
        private const val CURSOR_HMAC_ALGORITHM = "HmacSHA256"
        private const val CURSOR_SIGNATURE_BYTES = 18
        private const val DEFAULT_CURSOR_SIGNING_SECRET = "aquila-post-cursor-signing-secret-change-me"
    }

    private data class CursorToken(
        val createdAt: Instant,
        val id: Long,
    )
}
