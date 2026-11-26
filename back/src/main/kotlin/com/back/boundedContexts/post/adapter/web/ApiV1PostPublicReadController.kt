package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostPublicReadQueryUseCase
import com.back.boundedContexts.post.application.support.PostCacheTags
import com.back.boundedContexts.post.dto.AdjacentPostsDto
import com.back.boundedContexts.post.dto.CursorFeedPageDto
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.PublicPostBacklinksResBody
import com.back.boundedContexts.post.dto.PublicPostsBootstrapDto
import com.back.boundedContexts.post.dto.PublicSitemapPostsResBody
import com.back.boundedContexts.post.dto.PublicWikilinkCatalogResBody
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Positive
import org.springframework.http.ResponseEntity
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
    private val postPublicReadQueryUseCase: PostPublicReadQueryUseCase,
    private val postPublicReadResponseFactory: PostPublicReadResponseFactory,
    private val postSearchIntentResolver: PostSearchIntentResolver,
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
        val weakEtag = postPublicReadResponseFactory.buildFeedPageWeakEtag("feed", validPage, validPageSize, sort, data = data)
        return postPublicReadResponseFactory.respondWithWeakEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.FEED,
            surrogateKeys = setOf(PostCacheTags.LIST, PostCacheTags.FEED),
            weakEtag = weakEtag,
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
        val validSort = sort.normalizeForCursor()
        val data = postPublicReadQueryUseCase.getPublicFeedByCursor(cursor, validPageSize, validSort)
        val weakEtag = postPublicReadResponseFactory.buildCursorFeedWeakEtag("feed-cursor", validPageSize, validSort, cursor, data = data)
        return postPublicReadResponseFactory.respondWithWeakEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.FEED_CURSOR,
            surrogateKeys = setOf(PostCacheTags.LIST, PostCacheTags.FEED, PostCacheTags.FEED_CURSOR),
            weakEtag = weakEtag,
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
        val weakEtag =
            postPublicReadResponseFactory.buildFeedPageWeakEtag(
                "explore",
                validPage,
                validPageSize,
                sort,
                normalizedKw,
                normalizedTag,
                data,
            )
        return postPublicReadResponseFactory.respondWithWeakEtag(
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
            weakEtag = weakEtag,
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
        val validSort = sort.normalizeForCursor()
        val data = postPublicReadQueryUseCase.getPublicExploreByCursor(cursor, validPageSize, normalizedTag, validSort)
        val weakEtag =
            postPublicReadResponseFactory.buildCursorFeedWeakEtag("explore-cursor", validPageSize, validSort, cursor, normalizedTag, data)
        return postPublicReadResponseFactory.respondWithWeakEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.EXPLORE_CURSOR,
            surrogateKeys = postExploreCursorSurrogateKeys(normalizedTag),
            weakEtag = weakEtag,
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
        val weakEtag = postPublicReadResponseFactory.buildRelatedAuthorWeakEtag(authorId, safeExcludePostId, safeLimit, data)
        return postPublicReadResponseFactory.respondWithWeakEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.RELATED_AUTHOR,
            surrogateKeys = setOf(PostCacheTags.LIST, PostCacheTags.DETAIL),
            weakEtag = weakEtag,
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
        val searchPolicy = postPublicReadResponseFactory.resolveSearchReadCachePolicy(normalizedKw)
        val surrogateKeys =
            buildSet {
                add(PostCacheTags.SEARCH)
                if (normalizedTag.isNotBlank()) add(PostCacheTags.byTag(normalizedTag))
            }
        if (searchPolicy.noStore) {
            return postPublicReadResponseFactory.respondNoStore(
                response = response,
                cachePolicy = searchPolicy,
                surrogateKeys = surrogateKeys,
                startedAtNanos = startedAtNanos,
                originDescription = "search-no-store",
                body = data,
            )
        }
        val weakEtag =
            postPublicReadResponseFactory.buildFeedPageWeakEtag(
                if (normalizedTag.isBlank()) "search" else "search-tag-intent",
                validPage,
                validPageSize,
                sort,
                normalizedKw,
                normalizedTag,
                data,
            )
        return postPublicReadResponseFactory.respondWithWeakEtag(
            request = request,
            response = response,
            cachePolicy = searchPolicy,
            surrogateKeys = surrogateKeys,
            weakEtag = weakEtag,
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
        val weakEtag = postPublicReadResponseFactory.buildTagsWeakEtag(data)
        return postPublicReadResponseFactory.respondWithWeakEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.TAGS,
            surrogateKeys = setOf(PostCacheTags.TAGS),
            weakEtag = weakEtag,
            startedAtNanos = startedAtNanos,
            body = data,
        )
    }

    /**
     * 참조 구현: TryGhost/Ghost (MIT) & payloadcms/payload (MIT) — 공개 경량 Sitemap 엔드포인트
     */
    @GetMapping("/sitemap")
    fun getSitemap(
        request: HttpServletRequest,
        response: HttpServletResponse,
        @RequestParam(defaultValue = "$MAX_SITEMAP_LIMIT") limit: Int,
    ): ResponseEntity<PublicSitemapPostsResBody> {
        val startedAtNanos = System.nanoTime()
        val validLimit = limit.coerceIn(1, MAX_SITEMAP_LIMIT)
        val data = postPublicReadQueryUseCase.getPublicSitemap(validLimit)
        val weakEtag = postPublicReadResponseFactory.buildSitemapWeakEtag(validLimit, data)
        return postPublicReadResponseFactory.respondWithWeakEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.SITEMAP,
            surrogateKeys = setOf(PostCacheTags.LIST, PostCacheTags.SITEMAP),
            weakEtag = weakEtag,
            startedAtNanos = startedAtNanos,
            body = data,
        )
    }

    @GetMapping("/wikilink-catalog")
    fun getWikilinkCatalog(
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): ResponseEntity<PublicWikilinkCatalogResBody> {
        val startedAtNanos = System.nanoTime()
        val data = postPublicReadQueryUseCase.getPublicWikilinkCatalog()
        val weakEtag = postPublicReadResponseFactory.buildWikilinkCatalogWeakEtag(data)
        return postPublicReadResponseFactory.respondWithWeakEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.WIKILINK_CATALOG,
            surrogateKeys = setOf(PostCacheTags.LIST, PostCacheTags.SITEMAP),
            weakEtag = weakEtag,
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
        val validSort = sort.normalizeForCursor()
        val data = postPublicReadQueryUseCase.getPublicBootstrap(normalizedTag, validPageSize, validSort)
        val weakEtag =
            postPublicReadResponseFactory.buildBootstrapWeakEtag(
                pageSize = validPageSize,
                sort = validSort,
                tag = normalizedTag,
                data = data,
            )

        return postPublicReadResponseFactory.respondWithWeakEtag(
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
            weakEtag = weakEtag,
            startedAtNanos = startedAtNanos,
            body = data,
        )
    }

    @GetMapping
    fun getItems(
        request: HttpServletRequest,
        response: HttpServletResponse,
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "") kw: String,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): ResponseEntity<PageDto<PostDto>> {
        val startedAtNanos = System.nanoTime()
        val validPage = normalizePublicPage(page)
        val validPageSize = pageSize.coerceIn(1, 30)
        val normalizedKw = postSearchIntentResolver.normalizeKeyword(kw)
        val data = postPublicReadQueryUseCase.getPublicItems(validPage, validPageSize, normalizedKw, sort)
        val surrogateKeys =
            if (normalizedKw.isBlank()) {
                setOf(PostCacheTags.LIST, PostCacheTags.FEED)
            } else {
                setOf(PostCacheTags.LIST, PostCacheTags.SEARCH)
            }
        val cachePolicy =
            if (normalizedKw.isBlank()) {
                PostPublicReadCachePolicies.FEED
            } else {
                postPublicReadResponseFactory.resolveSearchReadCachePolicy(normalizedKw)
            }
        if (cachePolicy.noStore) {
            return postPublicReadResponseFactory.respondNoStore(
                response = response,
                cachePolicy = cachePolicy,
                surrogateKeys = surrogateKeys,
                startedAtNanos = startedAtNanos,
                originDescription = "items-no-store",
                body = data,
            )
        }
        val weakEtag =
            postPublicReadResponseFactory.buildPostDtoPageWeakEtag(
                source = "items",
                page = validPage,
                pageSize = validPageSize,
                sort = sort,
                kw = normalizedKw,
                data = data,
            )
        return postPublicReadResponseFactory.respondWithWeakEtag(
            request = request,
            response = response,
            cachePolicy = cachePolicy,
            surrogateKeys = surrogateKeys,
            weakEtag = weakEtag,
            startedAtNanos = startedAtNanos,
            body = data,
        )
    }

    @GetMapping("/{id}")
    fun getItem(
        request: HttpServletRequest,
        response: HttpServletResponse,
        @PathVariable @Positive id: Long,
    ): ResponseEntity<PostWithContentDto> {
        val startedAtNanos = System.nanoTime()
        val data = postPublicReadQueryUseCase.getPublicPostDetail(id)
        return postPublicReadResponseFactory.respondNoStore(
            response = response,
            cachePolicy = PostPublicReadCachePolicies.DETAIL,
            surrogateKeys = emptySet(),
            startedAtNanos = startedAtNanos,
            originDescription = "detail",
            body = data,
        )
    }

    @GetMapping("/{id}/adjacent")
    fun getAdjacent(
        request: HttpServletRequest,
        response: HttpServletResponse,
        @PathVariable @Positive id: Long,
    ): ResponseEntity<AdjacentPostsDto> {
        val startedAtNanos = System.nanoTime()
        val data = postPublicReadQueryUseCase.getAdjacentPosts(id)
        val weakEtag = postPublicReadResponseFactory.buildAdjacentWeakEtag(id, data)
        return postPublicReadResponseFactory.respondWithWeakEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.ADJACENT,
            surrogateKeys = setOf(PostCacheTags.LIST, PostCacheTags.DETAIL),
            weakEtag = weakEtag,
            startedAtNanos = startedAtNanos,
            body = data,
        )
    }

    @GetMapping("/{id}/backlinks")
    fun getBacklinks(
        request: HttpServletRequest,
        response: HttpServletResponse,
        @PathVariable @Positive id: Long,
    ): ResponseEntity<PublicPostBacklinksResBody> {
        val startedAtNanos = System.nanoTime()
        val data = postPublicReadQueryUseCase.getPublicBacklinks(id)
        val weakEtag = postPublicReadResponseFactory.buildBacklinksWeakEtag(id, data)
        return postPublicReadResponseFactory.respondWithWeakEtag(
            request = request,
            response = response,
            cachePolicy = PostPublicReadCachePolicies.BACKLINKS,
            surrogateKeys = setOf(PostCacheTags.LIST, PostCacheTags.DETAIL, PostCacheTags.byPostId(id)),
            weakEtag = weakEtag,
            startedAtNanos = startedAtNanos,
            body = data,
        )
    }

    private fun normalizePublicPage(page: Int): Int = page.coerceIn(1, MAX_PUBLIC_PAGE)

    companion object {
        private const val MAX_PUBLIC_PAGE = 200
        private const val MAX_RELATED_AUTHOR_LIMIT = 12
        private const val MAX_SITEMAP_LIMIT = 10_000
    }
}
