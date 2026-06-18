package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostHitDedupUseCase
import com.back.boundedContexts.post.application.port.input.PostPublicReadQueryUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.application.support.PostCacheTags
import com.back.boundedContexts.post.dto.CursorFeedPageDto
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.PublicPostsBootstrapDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.boundedContexts.post.model.Post
import com.back.global.rsData.RsData
import com.back.global.web.application.Rq
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.extensions.getOrThrow
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*

/**
 * ApiV1PostController는 웹 계층에서 HTTP 요청/응답을 처리하는 클래스입니다.
 * 입력 DTO 검증과 응답 포맷팅을 담당하고 비즈니스 처리는 애플리케이션 계층에 위임합니다.
 */
@RestController
@RequestMapping("/post/api/v1/posts")
class ApiV1PostController(
    private val postUseCase: PostUseCase,
    private val postHitDedupUseCase: PostHitDedupUseCase,
    private val postPublicReadQueryUseCase: PostPublicReadQueryUseCase,
    private val postPublicReadResponseFactory: PostPublicReadResponseFactory,
    private val postSearchIntentResolver: PostSearchIntentResolver,
    private val rq: Rq,
) {
    /**
     * makePostDtoPage 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
    private fun makePostDtoPage(postPage: PagedResult<Post>): PageDto<PostDto> {
        val actor = rq.actorOrNull
        val likedPostIds = postUseCase.findLikedPostIds(actor, postPage.content)

        return PageDto(
            postPage.map { post ->
                PostDto(post).apply {
                    actorHasLiked = post.id in likedPostIds
                }
            },
        )
    }

    private fun makePostWithContentDto(post: Post): PostWithContentDto {
        val actor = rq.actorOrNull
        val hasAdminRole = rq.hasRole("ADMIN")
        return PostWithContentDto(post).apply {
            tempDraft = postUseCase.isTempDraft(post)
            actorHasLiked = postUseCase.isLiked(post, actor)
            actorCanModify = hasAdminRole || post.getCheckActorCanModifyRs(actor).isSuccess
            actorCanDelete = hasAdminRole || post.getCheckActorCanDeleteRs(actor).isSuccess
        }
    }

    @GetMapping("/feed")
    @Transactional(readOnly = true)
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
    @Transactional(readOnly = true)
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

    /**
     * 검색/목록 조회 조건을 정규화해 페이징 결과를 구성합니다.
     * 컨트롤러 계층에서 요청 DTO를 검증한 뒤 서비스 호출 결과를 응답 규격으로 변환합니다.
     */
    @GetMapping("/explore")
    @Transactional(readOnly = true)
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
    @Transactional(readOnly = true)
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
            surrogateKeys =
                setOf(
                    PostCacheTags.LIST,
                    PostCacheTags.EXPLORE,
                    PostCacheTags.EXPLORE_CURSOR,
                    PostCacheTags.byTag(normalizedTag),
                ),
            etagSeed = etagSeed,
            startedAtNanos = startedAtNanos,
            body = data,
        )
    }

    @GetMapping("/related/author")
    @Transactional(readOnly = true)
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
    @Transactional(readOnly = true)
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
    @Transactional(readOnly = true)
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
    @Transactional(readOnly = true)
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
        return makePostDtoPage(postPage)
    }

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
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
        return ResponseEntity.ok(makePostWithContentDto(post))
    }

    data class PostWriteRequest(
        @field:NotBlank
        @field:Size(min = 2, max = 100)
        val title: String,
        @field:NotBlank
        @field:Size(min = 2)
        val content: String,
        val contentHtml: String? = null,
        val published: Boolean?,
        val listed: Boolean?,
    )

    /**
     * 생성 요청을 처리하고 멱등성·후속 동기화 절차를 함께 수행합니다.
     * 컨트롤러 계층에서 요청 DTO를 검증한 뒤 서비스 호출 결과를 응답 규격으로 변환합니다.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    fun write(
        @Valid @RequestBody reqBody: PostWriteRequest,
        @RequestHeader(name = "Idempotency-Key", required = false) idempotencyKey: String?,
    ): RsData<PostDto> {
        val post =
            postUseCase.write(
                rq.actor,
                reqBody.title,
                reqBody.content,
                reqBody.published ?: false,
                reqBody.listed ?: false,
                idempotencyKey,
                reqBody.contentHtml,
            )
        return RsData("201-1", "${post.id}번 글이 작성되었습니다.", PostDto(post))
    }

    data class PostModifyRequest(
        @field:NotBlank
        @field:Size(min = 2, max = 100)
        val title: String,
        @field:NotBlank
        @field:Size(min = 2)
        val content: String,
        val contentHtml: String? = null,
        val published: Boolean? = null,
        val listed: Boolean? = null,
        @field:Min(0)
        val version: Long,
    )

    data class PostWriteResultDto(
        val id: Long,
        val title: String,
        val version: Long,
        val published: Boolean,
        val listed: Boolean,
    )

    private fun makePostWriteResultDto(post: Post): PostWriteResultDto =
        PostWriteResultDto(
            id = post.id,
            title = post.title,
            version = post.version ?: 0L,
            published = post.published,
            listed = post.listed,
        )

    /**
     * 수정 요청을 처리하고 낙관적 잠금/후속 동기화를 수행합니다.
     * 컨트롤러 계층에서 요청 DTO를 검증한 뒤 서비스 호출 결과를 응답 규격으로 변환합니다.
     */
    @PutMapping("/{id}")
    @Transactional
    fun modify(
        @PathVariable @Positive id: Long,
        @Valid @RequestBody reqBody: PostModifyRequest,
    ): RsData<PostWriteResultDto> {
        val post = postUseCase.findById(id).getOrThrow()
        val actor = rq.actor
        // URL access 제어는 SecurityConfig(hasRole ADMIN)에서 우선 담당한다.
        // 역할 드리프트 상황에서도 작성자 전용 정책 검증은 비관리자 요청에만 한정한다.
        if (!rq.hasRole("ADMIN")) {
            post.checkActorCanModify(actor)
        }
        postUseCase.modify(
            actor,
            post,
            reqBody.title,
            reqBody.content,
            reqBody.published,
            reqBody.listed,
            reqBody.version,
            reqBody.contentHtml,
        )
        return RsData("200-1", "${post.id}번 글이 수정되었습니다.", makePostWriteResultDto(post))
    }

    @DeleteMapping("/{id}")
    @Transactional
    fun delete(
        @PathVariable @Positive id: Long,
    ): RsData<Void> {
        val post = postUseCase.findById(id).getOrThrow()
        val actor = rq.actor
        if (!rq.hasRole("ADMIN")) {
            post.checkActorCanDelete(actor)
        }
        postUseCase.delete(post, actor)
        return RsData("200-1", "${id}번 글이 삭제되었습니다.")
    }

    data class PostHitResBody(
        val hitCount: Int,
    )

    /**
     * incrementHit 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
    @PostMapping("/{id}/hit")
    @Transactional
    fun incrementHit(
        @PathVariable @Positive id: Long,
    ): RsData<PostHitResBody> {
        val post = postUseCase.findById(id).getOrThrow()
        if (!rq.hasRole("ADMIN")) {
            post.checkActorCanRead(rq.actorOrNull)
        }
        if (postHitDedupUseCase.shouldCountHit(id, resolveHitViewerKey())) {
            postUseCase.incrementHit(post)
        }
        return RsData(
            "200-1",
            "조회수를 반영했습니다.",
            PostHitResBody(post.hitCount),
        )
    }

    data class PostLikeToggleResBody(
        val liked: Boolean,
        val likesCount: Int,
    )

    /**
     * 좋아요 상태 변경을 반영하고 경쟁 상황에서의 정합성을 보장합니다.
     * 컨트롤러 계층에서 요청 DTO를 검증한 뒤 서비스 호출 결과를 응답 규격으로 변환합니다.
     */
    @PutMapping("/{id}/like")
    @Transactional
    fun like(
        @PathVariable @Positive id: Long,
    ): RsData<PostLikeToggleResBody> {
        val post = postUseCase.findById(id).getOrThrow()
        if (!rq.hasRole("ADMIN")) {
            post.checkActorCanRead(rq.actorOrNull)
        }
        val likeResult = postUseCase.like(post, rq.actor)
        return RsData(
            "200-1",
            "좋아요를 반영했습니다.",
            PostLikeToggleResBody(
                likeResult.isLiked,
                post.likesCount,
            ),
        )
    }

    /**
     * 좋아요 상태 변경을 반영하고 경쟁 상황에서의 정합성을 보장합니다.
     * 컨트롤러 계층에서 요청 DTO를 검증한 뒤 서비스 호출 결과를 응답 규격으로 변환합니다.
     */
    @DeleteMapping("/{id}/like")
    @Transactional
    fun unlike(
        @PathVariable @Positive id: Long,
    ): RsData<PostLikeToggleResBody> {
        val post = postUseCase.findById(id).getOrThrow()
        if (!rq.hasRole("ADMIN")) {
            post.checkActorCanRead(rq.actorOrNull)
        }
        val likeResult = postUseCase.unlike(post, rq.actor)
        return RsData(
            "200-1",
            "좋아요 취소를 반영했습니다.",
            PostLikeToggleResBody(
                likeResult.isLiked,
                post.likesCount,
            ),
        )
    }

    @GetMapping("/mine")
    @Transactional(readOnly = true)
    fun getMine(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "") kw: String,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): PageDto<PostDto> {
        val validPage = normalizePublicPage(page)
        val validPageSize = pageSize.coerceIn(1, 30)
        val postPage =
            postUseCase.findPagedByAuthor(
                rq.actor,
                postSearchIntentResolver.normalizeKeyword(kw),
                sort,
                validPage,
                validPageSize,
            )
        return makePostDtoPage(postPage)
    }

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
    @PostMapping("/temp")
    @Transactional
    fun getOrCreateTemp(response: jakarta.servlet.http.HttpServletResponse): RsData<PostWithContentDto> {
        val (post, isNew) = postUseCase.getOrCreateTemp(rq.actor)
        return if (isNew) {
            response.status = 201
            RsData("201-1", "임시저장 글이 생성되었습니다.", makePostWithContentDto(post))
        } else {
            RsData("200-1", "기존 임시저장 글을 불러옵니다.", makePostWithContentDto(post))
        }
    }

    private fun resolveHitViewerKey(): String =
        rq.actorOrNull
            ?.let { "member:${it.id}" }
            ?: "anon:${rq.clientIp}|${rq.userAgent}"

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
