package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.extensions.getOrThrow
import org.springframework.cache.annotation.Cacheable
import org.springframework.data.domain.Page
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * PostPublicReadQueryService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class PostPublicReadQueryService(
    private val postUseCase: PostUseCase,
) {
    @Transactional(readOnly = true)
    @Cacheable(
        cacheNames = [PostQueryCacheNames.FEED],
        key = "'page=' + #page + ':size=' + #pageSize + ':sort=' + #sort.name()",
    )
    fun getPublicFeed(
        page: Int,
        pageSize: Int,
        sort: PostSearchSortType1,
    ): PageDto<FeedPostDto> =
        toFeedPostDtoPage(
            postUseCase.findPagedByKw("", sort, page, pageSize),
        )

    @Transactional(readOnly = true)
    @Cacheable(
        cacheNames = [PostQueryCacheNames.EXPLORE],
        key =
            "'page=' + #page + ':size=' + #pageSize + ':sort=' + #sort.name()" +
                " + ':kw=' + T(com.back.boundedContexts.post.application.service.PostPublicReadQueryService).normalizeCacheToken(#kw)" +
                " + ':tag=' + T(com.back.boundedContexts.post.application.service.PostPublicReadQueryService).normalizeCacheToken(#tag)",
    )
    fun getPublicExplore(
        page: Int,
        pageSize: Int,
        kw: String,
        tag: String,
        sort: PostSearchSortType1,
    ): PageDto<FeedPostDto> {
        val normalizedTag = tag.trim()
        val postPage =
            if (normalizedTag.isBlank()) {
                postUseCase.findPagedByKw(kw, sort, page, pageSize)
            } else {
                postUseCase.findPagedByKwAndTag(kw, normalizedTag, sort, page, pageSize)
            }
        return toFeedPostDtoPage(postPage)
    }

    @Transactional(readOnly = true)
    @Cacheable(cacheNames = [PostQueryCacheNames.DETAIL_PUBLIC], key = "#id")
    fun getPublicPostDetail(id: Int): PostWithContentDto {
        val post = postUseCase.findById(id).getOrThrow()
        post.checkActorCanRead(null)
        return PostWithContentDto(post)
    }

    @Transactional(readOnly = true)
    @Cacheable(cacheNames = [PostQueryCacheNames.TAGS], key = "'public'")
    fun getPublicTagCounts(): List<TagCountDto> = postUseCase.getPublicTagCounts()

    private fun toFeedPostDtoPage(postPage: Page<com.back.boundedContexts.post.domain.Post>): PageDto<FeedPostDto> =
        PageDto(postPage.map(FeedPostDto::from))

    companion object {
        @JvmStatic
        fun normalizeCacheToken(raw: String): String =
            raw
                .trim()
                .replace(Regex("\\s+"), " ")
                .lowercase()
    }
}
