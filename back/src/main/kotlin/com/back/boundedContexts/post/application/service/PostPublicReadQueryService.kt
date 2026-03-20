package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.input.PostPublicReadQueryUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.extensions.getOrThrow
import org.slf4j.LoggerFactory
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.MessageDigest

/**
 * PostPublicReadQueryService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class PostPublicReadQueryService(
    private val postUseCase: PostUseCase,
    private val postReadBulkheadService: PostReadBulkheadService,
) : PostPublicReadQueryUseCase {
    private val logger = LoggerFactory.getLogger(PostPublicReadQueryService::class.java)

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
    @Cacheable(cacheNames = [PostQueryCacheNames.DETAIL_PUBLIC], key = "#id", sync = true)
    override fun getPublicPostDetail(id: Long): PostWithContentDto =
        runReadQuery("detail", "id=$id") {
            postReadBulkheadService.withDetailPermit {
                val post = postUseCase.findById(id).getOrThrow()
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
    }
}
