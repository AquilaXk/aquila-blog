package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.dto.CursorFeedPageDto
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.PublicPostsBootstrapDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Component

@Component
class PostPublicReadResponseFactory(
    private val cacheHeaderWriter: PostPublicReadCacheHeaderWriter = PostPublicReadCacheHeaderWriter(),
    private val serverTimingWriter: PostPublicReadServerTimingWriter = PostPublicReadServerTimingWriter(),
    private val etagSupport: PostPublicReadEtagSupport = PostPublicReadEtagSupport(),
    private val etagSeedBuilder: PostPublicReadEtagSeedBuilder = PostPublicReadEtagSeedBuilder(),
    private val searchCachePolicyResolver: PostSearchCachePolicyResolver = PostSearchCachePolicyResolver(),
) {
    fun <T : Any> respondWithEtag(
        request: HttpServletRequest,
        response: HttpServletResponse,
        cachePolicy: PublicReadCachePolicy,
        surrogateKeys: Set<String>,
        etagSeed: String,
        startedAtNanos: Long,
        body: T,
    ): ResponseEntity<T> {
        cacheHeaderWriter.applyPublicReadCacheHeaders(response, cachePolicy, surrogateKeys)
        val etag = etagSupport.toWeakEtag(etagSeed)
        response.setHeader(HttpHeaders.ETAG, etag)
        if (etagSupport.isNotModified(request, etag)) {
            serverTimingWriter.appendMetric(response, "cache;desc=\"etag-304\"")
            serverTimingWriter.appendOriginTiming(response, startedAtNanos, "etag-304")
            response.status = HttpServletResponse.SC_NOT_MODIFIED
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).build<T>()
        }
        serverTimingWriter.appendOriginTiming(response, startedAtNanos, "etag-200")
        return ResponseEntity.ok(body)
    }

    fun <T : Any> respondNoStore(
        response: HttpServletResponse,
        cachePolicy: PublicReadCachePolicy,
        surrogateKeys: Set<String>,
        startedAtNanos: Long,
        originDescription: String,
        body: T,
    ): ResponseEntity<T> {
        cacheHeaderWriter.applyPrivateNoStoreHeaders(response)
        response.setHeader("X-Cache-Policy", cachePolicy.name)
        cacheHeaderWriter.applySurrogateKeyHeaders(response, surrogateKeys)
        serverTimingWriter.appendMetric(response, "cache-policy;desc=\"${cachePolicy.name}\"")
        serverTimingWriter.appendOriginTiming(response, startedAtNanos, originDescription)
        return ResponseEntity.ok(body)
    }

    fun applyPrivateNoStoreHeaders(response: HttpServletResponse) {
        cacheHeaderWriter.applyPrivateNoStoreHeaders(response)
    }

    fun resolveSearchReadCachePolicy(keyword: String): PublicReadCachePolicy = searchCachePolicyResolver.resolve(keyword)

    fun buildFeedPageEtagSeed(
        source: String,
        page: Int,
        pageSize: Int,
        sort: PostSearchSortType1,
        kw: String = "",
        tag: String = "",
        data: PageDto<FeedPostDto>,
    ): String =
        etagSeedBuilder.buildFeedPageEtagSeed(
            source = source,
            page = page,
            pageSize = pageSize,
            sort = sort,
            kw = kw,
            tag = tag,
            data = data,
        )

    fun buildCursorFeedEtagSeed(
        source: String,
        pageSize: Int,
        sort: PostSearchSortType1,
        cursor: String?,
        tag: String = "",
        data: CursorFeedPageDto,
    ): String =
        etagSeedBuilder.buildCursorFeedEtagSeed(
            source = source,
            pageSize = pageSize,
            sort = sort,
            cursor = cursor,
            tag = tag,
            data = data,
        )

    fun buildPublicDetailEtagSeed(data: PostWithContentDto): String = etagSeedBuilder.buildPublicDetailEtagSeed(data)

    fun buildTagsEtagSeed(tags: List<TagCountDto>): String = etagSeedBuilder.buildTagsEtagSeed(tags)

    fun buildRelatedAuthorEtagSeed(
        authorId: Long,
        excludePostId: Long?,
        limit: Int,
        posts: List<FeedPostDto>,
    ): String =
        etagSeedBuilder.buildRelatedAuthorEtagSeed(
            authorId = authorId,
            excludePostId = excludePostId,
            limit = limit,
            posts = posts,
        )

    fun buildBootstrapEtagSeed(
        pageSize: Int,
        sort: PostSearchSortType1,
        tag: String,
        data: PublicPostsBootstrapDto,
    ): String =
        etagSeedBuilder.buildBootstrapEtagSeed(
            pageSize = pageSize,
            sort = sort,
            tag = tag,
            data = data,
        )
}
