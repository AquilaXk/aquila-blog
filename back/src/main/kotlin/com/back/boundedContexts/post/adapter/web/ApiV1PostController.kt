package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostHitDedupUseCase
import com.back.boundedContexts.post.application.port.input.PostPublicReadQueryUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.postMixin.PostLikeToggleResult
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.global.exception.application.AppException
import com.back.global.rsData.RsData
import com.back.global.web.application.Rq
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.extensions.getOrThrow
import jakarta.persistence.OptimisticLockException
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.Size
import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpStatus
import org.springframework.orm.ObjectOptimisticLockingFailureException
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.sql.SQLException

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
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): PageDto<FeedPostDto> {
        val validPage = normalizePublicPage(page)
        val validPageSize = pageSize.coerceIn(1, 30)
        return postPublicReadQueryUseCase.getPublicFeed(validPage, validPageSize, sort)
    }

    /**
     * 검색/목록 조회 조건을 정규화해 페이징 결과를 구성합니다.
     * 컨트롤러 계층에서 요청 DTO를 검증한 뒤 서비스 호출 결과를 응답 규격으로 변환합니다.
     */
    @GetMapping("/explore")
    @Transactional(readOnly = true)
    fun explore(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "") kw: String,
        @RequestParam(defaultValue = "") tag: String,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): PageDto<FeedPostDto> {
        val validPage = normalizePublicPage(page)
        val validPageSize = pageSize.coerceIn(1, 30)
        val normalizedKw = normalizeExploreKeyword(kw)
        val normalizedTag = normalizeExploreTag(tag)
        return postPublicReadQueryUseCase.getPublicExplore(validPage, validPageSize, normalizedKw, normalizedTag, sort)
    }

    @GetMapping("/search")
    @Transactional(readOnly = true)
    fun search(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "") kw: String,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): PageDto<FeedPostDto> {
        val validPage = normalizePublicPage(page)
        val validPageSize = pageSize.coerceIn(1, 30)
        val normalizedKw = normalizeExploreKeyword(kw)
        return postPublicReadQueryUseCase.getPublicSearch(validPage, validPageSize, normalizedKw, sort)
    }

    @GetMapping("/tags")
    @Transactional(readOnly = true)
    fun getTags(): List<TagCountDto> = postPublicReadQueryUseCase.getPublicTagCounts()

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
        @PathVariable @Positive id: Long,
    ): PostWithContentDto {
        if (rq.actorOrNull == null) {
            return postPublicReadQueryUseCase.getPublicPostDetail(id)
        }
        val post = postUseCase.findById(id).getOrThrow()
        post.checkActorCanRead(rq.actor)
        return makePostWithContentDto(post)
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

    private fun normalizeSearchToken(
        raw: String,
        maxLength: Int,
    ): String =
        raw
            .trim()
            .replace(Regex("\\s+"), " ")
            .take(maxLength)

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
        private const val MAX_PUBLIC_PAGE = 200
        private const val MAX_EXPLORE_KW_LENGTH = 80
        private const val MAX_EXPLORE_TAG_LENGTH = 40
    }
}
