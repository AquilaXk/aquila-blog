package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostHitDedupUseCase
import com.back.boundedContexts.post.application.port.input.PostPublicReadQueryUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.application.support.PostCacheTags
import com.back.boundedContexts.post.domain.postMixin.PostLikeToggleResult
import com.back.boundedContexts.post.dto.CursorFeedPageDto
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.boundedContexts.post.model.Post
import com.back.global.exception.application.AppException
import com.back.global.rsData.RsData
import com.back.global.web.application.Rq
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.extensions.getOrThrow
import jakarta.persistence.OptimisticLockException
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.Size
import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.orm.ObjectOptimisticLockingFailureException
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.sql.SQLException
import java.time.Instant
import java.util.Locale

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
    private val rq: Rq,
) {
    private val logger = LoggerFactory.getLogger(ApiV1PostController::class.java)

    private data class SearchIntent(
        val keyword: String,
        val tag: String,
    )

    private fun applyPublicReadCacheHeaders(
        response: HttpServletResponse,
        policy: PublicReadCachePolicy,
        surrogateKeys: Set<String>,
    ) {
        val safeMaxAge = policy.maxAgeSeconds.coerceAtLeast(0)
        val safeSharedMaxAge = policy.sharedMaxAgeSeconds.coerceAtLeast(safeMaxAge)
        val safeSWR = policy.staleWhileRevalidateSeconds.coerceAtLeast(0)
        val staleIfError = (safeSharedMaxAge + safeSWR).coerceAtLeast(safeSWR)
        response.setHeader(
            "Cache-Control",
            "public, max-age=$safeMaxAge, s-maxage=$safeSharedMaxAge, stale-while-revalidate=$safeSWR, stale-if-error=$staleIfError",
        )
        response.setHeader("X-Cache-Policy", policy.name)
        applySurrogateKeyHeaders(response, surrogateKeys)
        appendServerTiming(response, "cache-policy;desc=\"${policy.name}\"")
    }

    private fun applyPrivateNoStoreHeaders(response: HttpServletResponse) {
        response.setHeader("Cache-Control", "private, no-store, max-age=0")
    }

    private fun applySurrogateKeyHeaders(
        response: HttpServletResponse,
        surrogateKeys: Set<String>,
    ) {
        val normalized =
            surrogateKeys
                .asSequence()
                .map(::normalizeCacheTagToken)
                .filter { it.isNotBlank() }
                .distinct()
                .toList()
        if (normalized.isEmpty()) return
        response.setHeader("Surrogate-Key", normalized.joinToString(" "))
        response.setHeader("Cache-Tag", normalized.joinToString(","))
    }

    private fun normalizeCacheTagToken(raw: String): String =
        raw
            .trim()
            .lowercase()
            .replace(Regex("[^a-z0-9:_-]"), "-")
            .replace(Regex("-+"), "-")
            .trim('-')
            .take(MAX_CACHE_TAG_LENGTH)

    private fun appendServerTiming(
        response: HttpServletResponse,
        metric: String,
    ) {
        val current = response.getHeader("Server-Timing")
        if (current.isNullOrBlank()) {
            response.setHeader("Server-Timing", metric)
            return
        }
        response.setHeader("Server-Timing", "$current, $metric")
    }

    private fun appendOriginTiming(
        response: HttpServletResponse,
        startedAtNanos: Long,
        description: String,
    ) {
        val elapsedMs = ((System.nanoTime() - startedAtNanos).coerceAtLeast(0L)).toDouble() / 1_000_000.0
        val durationToken = String.format(Locale.US, "%.1f", elapsedMs)
        appendServerTiming(response, "origin;dur=$durationToken;desc=\"$description\"")
    }

    private fun normalizeEtagToken(raw: String): String = raw.trim().removePrefix("W/").removePrefix("w/")

    private fun toWeakEtag(seed: String): String {
        val digest =
            MessageDigest
                .getInstance("SHA-256")
                .digest(seed.toByteArray(StandardCharsets.UTF_8))
                .joinToString("") { each -> "%02x".format(each) }
                .take(32)
        return "W/\"$digest\""
    }

    private fun isNotModified(
        request: HttpServletRequest,
        etag: String,
    ): Boolean {
        val ifNoneMatch = request.getHeader(HttpHeaders.IF_NONE_MATCH)?.trim().orEmpty()
        if (ifNoneMatch.isBlank()) return false
        if (ifNoneMatch == "*") return true

        val expected = normalizeEtagToken(etag)
        return ifNoneMatch
            .split(",")
            .asSequence()
            .map { normalizeEtagToken(it) }
            .any { it == expected }
    }

    private fun <T : Any> respondPublicWithEtag(
        request: HttpServletRequest,
        response: HttpServletResponse,
        cachePolicy: PublicReadCachePolicy,
        surrogateKeys: Set<String>,
        etagSeed: String,
        startedAtNanos: Long,
        body: T,
    ): ResponseEntity<T> {
        applyPublicReadCacheHeaders(
            response,
            policy = cachePolicy,
            surrogateKeys = surrogateKeys,
        )
        val etag = toWeakEtag(etagSeed)
        response.setHeader(HttpHeaders.ETAG, etag)
        if (isNotModified(request, etag)) {
            appendServerTiming(response, "cache;desc=\"etag-304\"")
            appendOriginTiming(response, startedAtNanos, "etag-304")
            response.status = HttpServletResponse.SC_NOT_MODIFIED
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).build<T>()
        }
        appendOriginTiming(response, startedAtNanos, "etag-200")
        return ResponseEntity.ok(body)
    }

    private fun resolveSearchReadCachePolicy(keyword: String): PublicReadCachePolicy {
        val normalized = keyword.trim()
        if (normalized.isBlank()) {
            return SEARCH_DEFAULT_CACHE_POLICY
        }
        if (isHighEntropyKeyword(normalized)) {
            return SEARCH_NO_STORE_CACHE_POLICY
        }
        if (normalized.length >= SEARCH_SHORT_TTL_KEYWORD_LENGTH) {
            return SEARCH_SHORT_CACHE_POLICY
        }
        return SEARCH_DEFAULT_CACHE_POLICY
    }

    private fun isHighEntropyKeyword(keyword: String): Boolean {
        if (keyword.length >= SEARCH_NO_STORE_KEYWORD_LENGTH) return true

        val tokens = keyword.split(Regex("\\s+")).filter { it.isNotBlank() }
        if (tokens.size >= SEARCH_NO_STORE_TOKEN_COUNT) return true

        val alphaNumeric = keyword.filter { it.isLetterOrDigit() }
        if (alphaNumeric.length < SEARCH_HIGH_ENTROPY_MIN_LENGTH) return false

        val uniqueRatio =
            alphaNumeric
                .lowercase()
                .toSet()
                .size
                .toDouble() / alphaNumeric.length
        return uniqueRatio >= SEARCH_HIGH_ENTROPY_UNIQUE_RATIO_THRESHOLD
    }

    private fun toEpochMillis(instant: Instant): Long = instant.toEpochMilli()

    private fun buildFeedPageEtagSeed(
        source: String,
        page: Int,
        pageSize: Int,
        sort: PostSearchSortType1,
        kw: String = "",
        tag: String = "",
        data: PageDto<FeedPostDto>,
    ): String {
        val itemsToken =
            data.content.joinToString(separator = "|") {
                "${it.id}:${toEpochMillis(it.modifiedAt)}:${it.likesCount}:${it.commentsCount}:${it.hitCount}"
            }
        return buildString {
            append(source)
            append("|page=")
            append(page)
            append("|size=")
            append(pageSize)
            append("|sort=")
            append(sort.name)
            append("|kw=")
            append(kw.trim())
            append("|tag=")
            append(tag.trim())
            append("|total=")
            append(data.pageable.totalElements)
            append("|pages=")
            append(data.pageable.totalPages)
            append("|items=")
            append(itemsToken)
        }
    }

    private fun buildCursorFeedEtagSeed(
        source: String,
        pageSize: Int,
        sort: PostSearchSortType1,
        cursor: String?,
        tag: String = "",
        data: CursorFeedPageDto,
    ): String {
        val itemsToken =
            data.content.joinToString(separator = "|") {
                "${it.id}:${toEpochMillis(it.modifiedAt)}:${it.likesCount}:${it.commentsCount}:${it.hitCount}"
            }
        return buildString {
            append(source)
            append("|size=")
            append(pageSize)
            append("|sort=")
            append(sort.name)
            append("|cursor=")
            append(cursor?.trim().orEmpty())
            append("|tag=")
            append(tag.trim())
            append("|hasNext=")
            append(data.hasNext)
            append("|nextCursor=")
            append(data.nextCursor.orEmpty())
            append("|items=")
            append(itemsToken)
        }
    }

    private fun buildPublicDetailEtagSeed(data: PostWithContentDto): String =
        buildString {
            append(data.id)
            append("|")
            append(toEpochMillis(data.modifiedAt))
            append("|")
            append(data.version)
            append("|")
            append(data.likesCount)
            append("|")
            append(data.commentsCount)
            append("|")
            append(data.hitCount)
        }

    private fun buildTagsEtagSeed(tags: List<TagCountDto>): String = tags.joinToString(separator = "|") { "${it.tag}:${it.count}" }

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
        return PostWithContentDto(post).apply {
            actorHasLiked = postUseCase.isLiked(post, actor)
            actorCanModify = post.getCheckActorCanModifyRs(actor).isSuccess
            actorCanDelete = post.getCheckActorCanDeleteRs(actor).isSuccess
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
        val etagSeed = buildFeedPageEtagSeed("feed", validPage, validPageSize, sort, data = data)
        return respondPublicWithEtag(
            request = request,
            response = response,
            cachePolicy = FEED_CACHE_POLICY,
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
        val etagSeed = buildCursorFeedEtagSeed("feed-cursor", validPageSize, validSort, cursor, data = data)
        return respondPublicWithEtag(
            request = request,
            response = response,
            cachePolicy = FEED_CURSOR_CACHE_POLICY,
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
        val searchIntent = resolveSearchIntent(kw, tag)
        val normalizedKw = searchIntent.keyword
        val normalizedTag = searchIntent.tag
        val data = postPublicReadQueryUseCase.getPublicExplore(validPage, validPageSize, normalizedKw, normalizedTag, sort)
        val etagSeed = buildFeedPageEtagSeed("explore", validPage, validPageSize, sort, normalizedKw, normalizedTag, data)
        return respondPublicWithEtag(
            request = request,
            response = response,
            cachePolicy = EXPLORE_CACHE_POLICY,
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
        val normalizedTag = normalizeExploreTag(tag)
        val validSort = normalizeCursorSort(sort)
        val data = postPublicReadQueryUseCase.getPublicExploreByCursor(cursor, validPageSize, normalizedTag, validSort)
        val etagSeed = buildCursorFeedEtagSeed("explore-cursor", validPageSize, validSort, cursor, normalizedTag, data)
        return respondPublicWithEtag(
            request = request,
            response = response,
            cachePolicy = EXPLORE_CURSOR_CACHE_POLICY,
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
        val searchIntent = resolveSearchIntent(kw, "")
        val normalizedKw = searchIntent.keyword
        val normalizedTag = searchIntent.tag
        val data =
            if (normalizedTag.isBlank()) {
                postPublicReadQueryUseCase.getPublicSearch(validPage, validPageSize, normalizedKw, sort)
            } else {
                postPublicReadQueryUseCase.getPublicExplore(validPage, validPageSize, normalizedKw, normalizedTag, sort)
            }
        val etagSeed =
            buildFeedPageEtagSeed(
                if (normalizedTag.isBlank()) "search" else "search-tag-intent",
                validPage,
                validPageSize,
                sort,
                normalizedKw,
                normalizedTag,
                data,
            )
        val searchPolicy = resolveSearchReadCachePolicy(normalizedKw)
        if (searchPolicy.noStore) {
            applyPrivateNoStoreHeaders(response)
            response.setHeader("X-Cache-Policy", searchPolicy.name)
            applySurrogateKeyHeaders(
                response,
                buildSet {
                    add(PostCacheTags.SEARCH)
                    if (normalizedTag.isNotBlank()) add(PostCacheTags.byTag(normalizedTag))
                },
            )
            appendServerTiming(response, "cache-policy;desc=\"${searchPolicy.name}\"")
            appendOriginTiming(response, startedAtNanos, "search-no-store")
            return ResponseEntity.ok(data)
        }
        return respondPublicWithEtag(
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
        val etagSeed = buildTagsEtagSeed(data)
        return respondPublicWithEtag(
            request = request,
            response = response,
            cachePolicy = TAGS_CACHE_POLICY,
            surrogateKeys = setOf(PostCacheTags.TAGS),
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
        val postPage = postUseCase.findPagedByKw(normalizeExploreKeyword(kw), sort, validPage, validPageSize)
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
            val etagSeed = buildPublicDetailEtagSeed(data)
            return respondPublicWithEtag(
                request = request,
                response = response,
                cachePolicy = DETAIL_CACHE_POLICY,
                surrogateKeys = setOf(PostCacheTags.DETAIL, PostCacheTags.byPostId(id)),
                etagSeed = etagSeed,
                startedAtNanos = startedAtNanos,
                body = data,
            )
        }
        applyPrivateNoStoreHeaders(response)
        val post = postUseCase.findById(id).getOrThrow()
        post.checkActorCanRead(rq.actor)
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
        val version: Long? = null,
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
        post.checkActorCanModify(rq.actor)
        postUseCase.modify(
            rq.actor,
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
        post.checkActorCanDelete(rq.actor)
        postUseCase.delete(post, rq.actor)
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
        post.checkActorCanRead(rq.actorOrNull)
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
        post.checkActorCanRead(rq.actorOrNull)
        val likeResult = resolveLikeResult(post) { postUseCase.like(post, rq.actor) }
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
        post.checkActorCanRead(rq.actorOrNull)
        val likeResult = resolveLikeResult(post) { postUseCase.unlike(post, rq.actor) }
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
        val postPage = postUseCase.findPagedByAuthor(rq.actor, normalizeExploreKeyword(kw), sort, validPage, validPageSize)
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

    private fun normalizeExploreKeyword(raw: String): String = normalizeSearchToken(raw, MAX_EXPLORE_KW_LENGTH)

    private fun normalizeExploreTag(raw: String): String = normalizeSearchToken(raw, MAX_EXPLORE_TAG_LENGTH)

    private fun normalizeCursorSort(sort: PostSearchSortType1): PostSearchSortType1 =
        when (sort) {
            PostSearchSortType1.CREATED_AT,
            PostSearchSortType1.CREATED_AT_ASC,
            -> sort
            else -> PostSearchSortType1.CREATED_AT
        }

    private fun normalizeSearchToken(
        raw: String,
        maxLength: Int,
    ): String =
        raw
            .trim()
            .replace(Regex("\\s+"), " ")
            .take(maxLength)

    private fun resolveSearchIntent(
        rawKw: String,
        rawTag: String,
    ): SearchIntent {
        val normalizedKw = normalizeExploreKeyword(rawKw)
        val normalizedTag = normalizeExploreTag(rawTag)
        if (normalizedTag.isNotBlank()) {
            return SearchIntent(keyword = normalizedKw, tag = normalizedTag)
        }

        val hashtagRegex = Regex("(^|\\s)#([\\p{L}\\p{N}_-]{1,40})")
        val hashMatchedTag =
            hashtagRegex
                .find(normalizedKw)
                ?.groupValues
                ?.getOrNull(2)
                .orEmpty()
        if (hashMatchedTag.isNotBlank()) {
            val cleanedKeyword =
                hashtagRegex
                    .replace(normalizedKw, " ")
                    .replace(Regex("\\s+"), " ")
                    .trim()
            return SearchIntent(
                keyword = cleanedKeyword.take(MAX_EXPLORE_KW_LENGTH),
                tag = normalizeExploreTag(hashMatchedTag),
            )
        }

        val prefixedTagRegex = Regex("^(?:tag|태그)\\s*:\\s*([\\p{L}\\p{N}_-]{1,40})$", RegexOption.IGNORE_CASE)
        val prefixedTag =
            prefixedTagRegex
                .find(normalizedKw)
                ?.groupValues
                ?.getOrNull(1)
                .orEmpty()
        if (prefixedTag.isNotBlank()) {
            return SearchIntent(
                keyword = "",
                tag = normalizeExploreTag(prefixedTag),
            )
        }

        return SearchIntent(keyword = normalizedKw, tag = "")
    }

    /**
     * 실행 시점에 필요한 의존성/값을 결정합니다.
     * 컨트롤러 계층에서 요청 DTO를 검증한 뒤 서비스 호출 결과를 응답 규격으로 변환합니다.
     */
    private fun resolveLikeResult(
        post: Post,
        action: () -> PostLikeToggleResult,
    ): PostLikeToggleResult =
        try {
            action()
        } catch (exception: Exception) {
            if (!isRecoverableLikeConflict(exception)) throw exception
            recoverLikeResult(post, exception)
        }

    /**
     * recoverLikeResult 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
    private fun recoverLikeResult(
        post: Post,
        exception: Exception,
    ): PostLikeToggleResult {
        logger.warn("Like conflict recovered with reconcile/snapshot. postId={} actorId={}", post.id, rq.actor.id, exception)
        return try {
            postUseCase.reconcileLikeState(post, rq.actor)
        } catch (reconcileException: Exception) {
            logger.warn(
                "Like reconcile failed, fallback to snapshot. postId={} actorId={}",
                post.id,
                rq.actor.id,
                reconcileException,
            )
            postUseCase.readLikeSnapshot(post, rq.actor)
        }
    }

    /**
     * 검증 규칙을 적용해 허용 여부를 판정합니다.
     * 컨트롤러 계층에서 요청 DTO를 검증한 뒤 서비스 호출 결과를 응답 규격으로 변환합니다.
     */
    private fun isRecoverableLikeConflict(exception: Exception): Boolean {
        if (exception is DataIntegrityViolationException) return true
        if (exception is ObjectOptimisticLockingFailureException) return true
        if (exception is OptimisticLockingFailureException) return true
        if (exception is OptimisticLockException) return true
        if (exception is AppException && exception.rsData.statusCode == 409) return true

        val sqlException =
            generateSequence<Throwable>(exception) { it.cause }
                .filterIsInstance<SQLException>()
                .firstOrNull()
        return sqlException?.sqlState in setOf("23505", "40001", "40P01")
    }

    companion object {
        private val FEED_CACHE_POLICY =
            PublicReadCachePolicy(
                name = "feed-max20-smax60-swr60",
                maxAgeSeconds = 20,
                sharedMaxAgeSeconds = 60,
                staleWhileRevalidateSeconds = 60,
            )
        private val FEED_CURSOR_CACHE_POLICY =
            PublicReadCachePolicy(
                name = "feed-cursor-max20-smax60-swr60",
                maxAgeSeconds = 20,
                sharedMaxAgeSeconds = 60,
                staleWhileRevalidateSeconds = 60,
            )
        private val EXPLORE_CACHE_POLICY =
            PublicReadCachePolicy(
                name = "explore-max20-smax60-swr60",
                maxAgeSeconds = 20,
                sharedMaxAgeSeconds = 60,
                staleWhileRevalidateSeconds = 60,
            )
        private val EXPLORE_CURSOR_CACHE_POLICY =
            PublicReadCachePolicy(
                name = "explore-cursor-max20-smax60-swr60",
                maxAgeSeconds = 20,
                sharedMaxAgeSeconds = 60,
                staleWhileRevalidateSeconds = 60,
            )
        private val SEARCH_DEFAULT_CACHE_POLICY =
            PublicReadCachePolicy(
                name = "search-max15-smax45-swr45",
                maxAgeSeconds = 15,
                sharedMaxAgeSeconds = 45,
                staleWhileRevalidateSeconds = 45,
            )
        private val SEARCH_SHORT_CACHE_POLICY =
            PublicReadCachePolicy(
                name = "search-short-max5-smax10-swr15",
                maxAgeSeconds = 5,
                sharedMaxAgeSeconds = 10,
                staleWhileRevalidateSeconds = 15,
            )
        private val SEARCH_NO_STORE_CACHE_POLICY =
            PublicReadCachePolicy(
                name = "search-high-entropy-no-store",
                maxAgeSeconds = 0,
                sharedMaxAgeSeconds = 0,
                staleWhileRevalidateSeconds = 0,
                noStore = true,
            )
        private val TAGS_CACHE_POLICY =
            PublicReadCachePolicy(
                name = "tags-max60-smax300-swr300",
                maxAgeSeconds = 60,
                sharedMaxAgeSeconds = 300,
                staleWhileRevalidateSeconds = 300,
            )
        private val DETAIL_CACHE_POLICY =
            PublicReadCachePolicy(
                name = "detail-max20-smax60-swr60",
                maxAgeSeconds = 20,
                sharedMaxAgeSeconds = 60,
                staleWhileRevalidateSeconds = 60,
            )

        private const val MAX_PUBLIC_PAGE = 200
        private const val MAX_EXPLORE_KW_LENGTH = 80
        private const val MAX_EXPLORE_TAG_LENGTH = 40
        private const val MAX_CACHE_TAG_LENGTH = 64
        private const val SEARCH_SHORT_TTL_KEYWORD_LENGTH = 16
        private const val SEARCH_NO_STORE_KEYWORD_LENGTH = 28
        private const val SEARCH_NO_STORE_TOKEN_COUNT = 4
        private const val SEARCH_HIGH_ENTROPY_MIN_LENGTH = 16
        private const val SEARCH_HIGH_ENTROPY_UNIQUE_RATIO_THRESHOLD = 0.58
    }

    private data class PublicReadCachePolicy(
        val name: String,
        val maxAgeSeconds: Int,
        val sharedMaxAgeSeconds: Int,
        val staleWhileRevalidateSeconds: Int,
        val noStore: Boolean = false,
    )
}
