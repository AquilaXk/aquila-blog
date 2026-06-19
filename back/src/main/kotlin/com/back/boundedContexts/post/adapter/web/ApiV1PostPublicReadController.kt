package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostPublicReadQueryUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.application.support.PostCacheTags
import com.back.boundedContexts.post.dto.CursorFeedPageDto
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.PublicPostsBootstrapDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.global.web.application.Rq
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.extensions.getOrThrow
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Positive
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*

internal fun postExploreCursorSurrogateKeys(normalizedTag: String): Set<String> =
    buildSet {
        add(PostCacheTags.LIST)
        add(PostCacheTags.EXPLORE)
        add(PostCacheTags.EXPLORE_CURSOR)
        if (normalizedTag.isNotBlank()) {
            add(PostCacheTags.byTag(normalizedTag))
        }
    }

@RestController
@RequestMapping("/post/api/v1/posts")
class ApiV1PostPublicReadController(
    private val postUseCase: PostUseCase,
    private val postPublicReadQueryUseCase: PostPublicReadQueryUseCase,
    private val postPublicReadResponseFactory: PostPublicReadResponseFactory,
    private val postSearchIntentResolver: PostSearchIntentResolver,
    private val postWebDtoAssembler: PostWebDtoAssembler,
    private val rq: Rq,
) {
    @GetMapping("/feed")
    fun getFeed(
        request: HttpServletRequest,
        response: HttpServletResponse,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): ResponseEntity<PageDto<FeedPostDto>> {
        val startedAtNanos = System.nanoTime()
        val validPage = normalizePublicPage(page)
        val validPageSize = pageSize.coerceIn(1, 30)
        val data = postPublicReadQueryUseCase.getPublicFeed(validPage, validPageSize, sort)
        val etagSeed = postPublicReadResponseFactory.buildFeedPageEtagSeed("feed", validPage, validPageSize, sort, data = data)
        return postPublicReadResponseFactory.respondWithEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.FEED,
            surrogateKeys = setOf(PostCacheTags.LIST, PostCacheTags.FEED),
            etagSeed = etagSeed,
            startedAtNanos = startedAtNanos,
            body = data,
        )
    }

    @GetMapping("/feed/cursor")
    fun getFeedByCursor(
        request: HttpServletRequest,
        response: HttpServletResponse,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): ResponseEntity<CursorFeedPageDto> {
        val startedAtNanos = System.nanoTime()
        val validPageSize = pageSize.coerceIn(1, 30)
        val validSort = normalizeCursorSort(sort)
        val data = postPublicReadQueryUseCase.getPublicFeedByCursor(cursor, validPageSize, validSort)
        val etagSeed = postPublicReadResponseFactory.buildCursorFeedEtagSeed("feed-cursor", validPageSize, validSort, cursor, data = data)
        return postPublicReadResponseFactory.respondWithEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.FEED_CURSOR,
            surrogateKeys = setOf(PostCacheTags.LIST, PostCacheTags.FEED, PostCacheTags.FEED_CURSOR),
            etagSeed = etagSeed,
            startedAtNanos = startedAtNanos,
            body = data,
        )
    }

    @GetMapping("/explore")
    fun explore(
        request: HttpServletRequest,
        response: HttpServletResponse,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "") kw: String,
        @RequestParam(defaultValue = "") tag: String,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): ResponseEntity<PageDto<FeedPostDto>> {
        val startedAtNanos = System.nanoTime()
        val validPage = normalizePublicPage(page)
        val validPageSize = pageSize.coerceIn(1, 30)
        val searchIntent = postSearchIntentResolver.resolve(kw, tag)
        val normalizedKw = searchIntent.keyword
        val normalizedTag = searchIntent.tag
        val data = postPublicReadQueryUseCase.getPublicExplore(validPage, validPageSize, normalizedKw, normalizedTag, sort)
        val etagSeed =
            postPublicReadResponseFactory.buildFeedPageEtagSeed(
                "explore",
                validPage,
                validPageSize,
                sort,
                normalizedKw,
                normalizedTag,
                data,
            )
        return postPublicReadResponseFactory.respondWithEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.EXPLORE,
            surrogateKeys =
                buildSet {
                    add(PostCacheTags.LIST)
                    add(PostCacheTags.EXPLORE)
                    if (normalizedTag.isNotBlank()) {
                        add(PostCacheTags.byTag(normalizedTag))
                    }
                },
            etagSeed = etagSeed,
            startedAtNanos = startedAtNanos,
            body = data,
        )
    }

    @GetMapping("/explore/cursor")
    fun exploreByCursor(
        request: HttpServletRequest,
        response: HttpServletResponse,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "") tag: String,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): ResponseEntity<CursorFeedPageDto> {
        val startedAtNanos = System.nanoTime()
        val validPageSize = pageSize.coerceIn(1, 30)
        val normalizedTag = postSearchIntentResolver.normalizeTag(tag)
        val validSort = normalizeCursorSort(sort)
        val data = postPublicReadQueryUseCase.getPublicExploreByCursor(cursor, validPageSize, normalizedTag, validSort)
        val etagSeed =
            postPublicReadResponseFactory.buildCursorFeedEtagSeed("explore-cursor", validPageSize, validSort, cursor, normalizedTag, data)
        return postPublicReadResponseFactory.respondWithEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.EXPLORE_CURSOR,
            surrogateKeys = postExploreCursorSurrogateKeys(normalizedTag),
            etagSeed = etagSeed,
            startedAtNanos = startedAtNanos,
            body = data,
        )
    }

    @GetMapping("/related/author")
    fun getRelatedByAuthor(
        request: HttpServletRequest,
        response: HttpServletResponse,
        @RequestParam @Positive authorId: Long,
        @RequestParam(required = false) excludePostId: Long?,
        @RequestParam(defaultValue = "4") @Min(1) limit: Int,
    ): ResponseEntity<List<FeedPostDto>> {
        val startedAtNanos = System.nanoTime()
        val safeLimit = limit.coerceIn(1, MAX_RELATED_AUTHOR_LIMIT)
        val safeExcludePostId = excludePostId?.takeIf { it > 0L }
        val data =
            postPublicReadQueryUseCase.getPublicRelatedByAuthor(
                authorId = authorId,
                excludePostId = safeExcludePostId,
                limit = safeLimit,
            )
        val etagSeed = postPublicReadResponseFactory.buildRelatedAuthorEtagSeed(authorId, safeExcludePostId, safeLimit, data)
        return postPublicReadResponseFactory.respondWithEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.RELATED_AUTHOR,
            surrogateKeys = setOf(PostCacheTags.LIST, PostCacheTags.DETAIL),
            etagSeed = etagSeed,
            startedAtNanos = startedAtNanos,
            body = data,
        )
    }

    @GetMapping("/search")
    fun search(
        request: HttpServletRequest,
        response: HttpServletResponse,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "") kw: String,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): ResponseEntity<PageDto<FeedPostDto>> {
        val startedAtNanos = System.nanoTime()
        val validPage = normalizePublicPage(page)
        val validPageSize = pageSize.coerceIn(1, 30)
        val searchIntent = postSearchIntentResolver.resolve(kw, "")
        val normalizedKw = searchIntent.keyword
        val normalizedTag = searchIntent.tag
        val data =
            if (normalizedTag.isBlank()) {
                postPublicReadQueryUseCase.getPublicSearch(validPage, validPageSize, normalizedKw, sort)
            } else {
                postPublicReadQueryUseCase.getPublicExplore(validPage, validPageSize, normalizedKw, normalizedTag, sort)
            }
        val etagSeed =
            postPublicReadResponseFactory.buildFeedPageEtagSeed(
                if (normalizedTag.isBlank()) "search" else "search-tag-intent",
                validPage,
                validPageSize,
                sort,
                normalizedKw,
                normalizedTag,
                data,
            )
        val searchPolicy = postPublicReadResponseFactory.resolveSearchReadCachePolicy(normalizedKw)
        if (searchPolicy.noStore) {
            return postPublicReadResponseFactory.respondNoStore(
                response = response,
                cachePolicy = searchPolicy,
                surrogateKeys =
                    buildSet {
                        add(PostCacheTags.SEARCH)
                        if (normalizedTag.isNotBlank()) add(PostCacheTags.byTag(normalizedTag))
                    },
                startedAtNanos = startedAtNanos,
                originDescription = "search-no-store",
                body = data,
            )
        }
        return postPublicReadResponseFactory.respondWithEtag(
            request = request,
            response = response,
            cachePolicy = searchPolicy,
            surrogateKeys =
                buildSet {
                    add(PostCacheTags.SEARCH)
                    if (normalizedTag.isNotBlank()) add(PostCacheTags.byTag(normalizedTag))
                },
            etagSeed = etagSeed,
            startedAtNanos = startedAtNanos,
            body = data,
        )
    }

    @GetMapping("/tags")
    fun getTags(
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): ResponseEntity<List<TagCountDto>> {
        val startedAtNanos = System.nanoTime()
        val data = postPublicReadQueryUseCase.getPublicTagCounts()
        val etagSeed = postPublicReadResponseFactory.buildTagsEtagSeed(data)
        return postPublicReadResponseFactory.respondWithEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.TAGS,
            surrogateKeys = setOf(PostCacheTags.TAGS),
            etagSeed = etagSeed,
            startedAtNanos = startedAtNanos,
            body = data,
        )
    }

    @GetMapping("/bootstrap")
    fun getBootstrap(
        request: HttpServletRequest,
        response: HttpServletResponse,
        @RequestParam(defaultValue = "") tag: String,
        @RequestParam(defaultValue = "24") pageSize: Int,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): ResponseEntity<PublicPostsBootstrapDto> {
        val startedAtNanos = System.nanoTime()
        val normalizedTag = postSearchIntentResolver.normalizeTag(tag)
        val validPageSize = pageSize.coerceIn(1, 30)
        val validSort = normalizeCursorSort(sort)
        val data = postPublicReadQueryUseCase.getPublicBootstrap(normalizedTag, validPageSize, validSort)
        val etagSeed =
            postPublicReadResponseFactory.buildBootstrapEtagSeed(
                pageSize = validPageSize,
                sort = validSort,
                tag = normalizedTag,
                data = data,
            )

        return postPublicReadResponseFactory.respondWithEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.BOOTSTRAP,
            surrogateKeys =
                buildSet {
                    add(PostCacheTags.LIST)
                    add(PostCacheTags.FEED_CURSOR)
                    add(PostCacheTags.TAGS)
                    if (normalizedTag.isBlank()) {
                        add(PostCacheTags.FEED)
                    } else {
                        add(PostCacheTags.EXPLORE)
                        add(PostCacheTags.EXPLORE_CURSOR)
                        add(PostCacheTags.byTag(normalizedTag))
                    }
                },
            etagSeed = etagSeed,
            startedAtNanos = startedAtNanos,
            body = data,
        )
    }

    @GetMapping
    @Transactional(readOnly = true)
    fun getItems(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "") kw: String,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): PageDto<PostDto> {
        val validPage = normalizePublicPage(page)
        val validPageSize = pageSize.coerceIn(1, 30)
        val postPage = postUseCase.findPagedByKw(postSearchIntentResolver.normalizeKeyword(kw), sort, validPage, validPageSize)
        return postWebDtoAssembler.makePostDtoPage(postPage)
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    fun getItem(
        request: HttpServletRequest,
        response: HttpServletResponse,
        @PathVariable @Positive id: Long,
    ): ResponseEntity<PostWithContentDto> {
        val startedAtNanos = System.nanoTime()
        if (rq.actorOrNull == null) {
            val data = postPublicReadQueryUseCase.getPublicPostDetail(id)
            val etagSeed = postPublicReadResponseFactory.buildPublicDetailEtagSeed(data)
            return postPublicReadResponseFactory.respondWithEtag(
                request = request,
                response = response,
                cachePolicy = PostPublicReadCachePolicies.DETAIL,
                surrogateKeys = setOf(PostCacheTags.DETAIL, PostCacheTags.byPostId(id)),
                etagSeed = etagSeed,
                startedAtNanos = startedAtNanos,
                body = data,
            )
        }
        postPublicReadResponseFactory.applyPrivateNoStoreHeaders(response)
        val post = postUseCase.findById(id).getOrThrow()
        if (!rq.hasRole("ADMIN")) {
            post.checkActorCanRead(rq.actor)
        }
        return ResponseEntity.ok(postWebDtoAssembler.makePostWithContentDto(post))
    }

    private fun normalizePublicPage(page: Int): Int = page.coerceIn(1, MAX_PUBLIC_PAGE)

    private fun normalizeCursorSort(sort: PostSearchSortType1): PostSearchSortType1 =
        when (sort) {
            PostSearchSortType1.CREATED_AT,
            PostSearchSortType1.CREATED_AT_ASC,
            -> sort
            else -> PostSearchSortType1.CREATED_AT
        }

    companion object {
        private const val MAX_PUBLIC_PAGE = 200
        private const val MAX_RELATED_AUTHOR_LIMIT = 12
    }
}
