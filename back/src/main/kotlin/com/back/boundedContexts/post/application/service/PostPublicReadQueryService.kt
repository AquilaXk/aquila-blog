package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.input.PostPublicReadQueryUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.CursorFeedPageDto
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.global.exception.application.AppException
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.extensions.getOrThrow
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * PostPublicReadQueryService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class PostPublicReadQueryService(
    private val postUseCase: PostUseCase,
    private val postReadBulkheadService: PostReadBulkheadService,
    @Value("\${custom.post.read.cursor-signing-secret:}") cursorSigningSecret: String,
) : PostPublicReadQueryUseCase {
    private val logger = LoggerFactory.getLogger(PostPublicReadQueryService::class.java)
    private val cursorSecretBytes = resolveCursorSecret(cursorSigningSecret).toByteArray(StandardCharsets.UTF_8)

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
                val normalizedTag = tag.trim()
                val postPage =
                    if (normalizedTag.isBlank()) {
                        postUseCase.findPagedByKw(kw, sort, page, pageSize)
                    } else {
                        postUseCase.findPagedByKwAndTag(kw, normalizedTag, sort, page, pageSize)
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
                toFeedPostDtoPage(
                    postUseCase.findPagedByKw(kw, sort, page, pageSize),
                )
            }
        }

    @Transactional(readOnly = true)
    @Cacheable(cacheNames = [PostQueryCacheNames.DETAIL_PUBLIC], key = "#id", sync = true)
    override fun getPublicPostDetail(id: Long): PostWithContentDto =
        runReadQuery("detail", "id=$id") {
            postReadBulkheadService.withDetailPermit {
                val post = postUseCase.findPublicDetailById(id).getOrThrow()
                post.checkActorCanRead(null)
                PostWithContentDto(post)
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
    ): T =
        try {
            block()
        } catch (exception: Exception) {
            logger.error(
                "post_public_read_failed endpoint={} detail={} exception={}",
                endpoint,
                detail,
                exception::class.java.simpleName,
                exception,
            )
            throw exception
        }

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
        private const val MAX_CACHEABLE_PAGE = 20
        private const val MAX_CACHEABLE_KW_LENGTH = 40
        private const val MAX_CACHEABLE_TAG_LENGTH = 24
        private const val MAX_CACHEABLE_TOTAL_LENGTH = 48
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
