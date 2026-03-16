package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.application.service.PostHitDedupService
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

@RestController
@RequestMapping("/post/api/v1/posts")
class ApiV1PostController(
    private val postUseCase: PostUseCase,
    private val postHitDedupService: PostHitDedupService,
    private val rq: Rq,
) {
    private val logger = LoggerFactory.getLogger(ApiV1PostController::class.java)

    private fun makePostDtoPage(postPage: org.springframework.data.domain.Page<Post>): PageDto<PostDto> {
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

    private fun makeFeedPostDtoPage(postPage: org.springframework.data.domain.Page<Post>): PageDto<FeedPostDto> =
        PageDto(postPage.map(FeedPostDto::from))

    @GetMapping("/feed")
    @Transactional(readOnly = true)
    fun getFeed(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): PageDto<FeedPostDto> {
        val validPage = page.coerceAtLeast(1)
        val validPageSize = pageSize.coerceIn(1, 30)
        // feed는 메인 첫 진입용 "최근 공개 목록" 계약을 유지한다.
        val postPage = postUseCase.findPagedByKw("", sort, validPage, validPageSize)
        return makeFeedPostDtoPage(postPage)
    }

    @GetMapping("/explore")
    @Transactional(readOnly = true)
    fun explore(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "") kw: String,
        @RequestParam(defaultValue = "") tag: String,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): PageDto<FeedPostDto> {
        val validPage = page.coerceAtLeast(1)
        val validPageSize = pageSize.coerceIn(1, 30)
        val normalizedTag = tag.trim()
        val postPage =
            if (normalizedTag.isBlank()) {
                postUseCase.findPagedByKw(kw, sort, validPage, validPageSize)
            } else {
                postUseCase.findPagedByKwAndTag(kw, normalizedTag, sort, validPage, validPageSize)
            }

        return makeFeedPostDtoPage(postPage)
    }

    @GetMapping("/tags")
    @Transactional(readOnly = true)
    fun getTags(): List<TagCountDto> = postUseCase.getPublicTagCounts()

    @GetMapping
    @Transactional(readOnly = true)
    fun getItems(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "") kw: String,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): PageDto<PostDto> {
        val validPage = page.coerceAtLeast(1)
        val validPageSize = pageSize.coerceIn(1, 30)
        val postPage = postUseCase.findPagedByKw(kw, sort, validPage, validPageSize)
        return makePostDtoPage(postPage)
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    fun getItem(
        @PathVariable @Positive id: Int,
    ): PostWithContentDto {
        val post = postUseCase.findById(id).getOrThrow()
        post.checkActorCanRead(rq.actorOrNull)
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
        val id: Int,
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

    @PutMapping("/{id}")
    @Transactional
    fun modify(
        @PathVariable @Positive id: Int,
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
        @PathVariable @Positive id: Int,
    ): RsData<Void> {
        val post = postUseCase.findById(id).getOrThrow()
        post.checkActorCanDelete(rq.actor)
        postUseCase.delete(post, rq.actor)
        return RsData("200-1", "${id}번 글이 삭제되었습니다.")
    }

    data class PostHitResBody(
        val hitCount: Int,
    )

    @PostMapping("/{id}/hit")
    @Transactional
    fun incrementHit(
        @PathVariable @Positive id: Int,
    ): RsData<PostHitResBody> {
        val post = postUseCase.findById(id).getOrThrow()
        post.checkActorCanRead(rq.actorOrNull)
        if (postHitDedupService.shouldCountHit(id, resolveHitViewerKey())) {
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

    @PostMapping("/{id}/like")
    @Transactional
    fun toggleLike(
        @PathVariable @Positive id: Int,
    ): RsData<PostLikeToggleResBody> {
        val post = postUseCase.findById(id).getOrThrow()
        post.checkActorCanRead(rq.actorOrNull)
        val likeResult = resolveLikeResult(post) { postUseCase.toggleLike(post, rq.actor) }
        val msg = if (likeResult.isLiked) "좋아요를 눌렀습니다." else "좋아요를 취소했습니다."
        return RsData(
            "200-1",
            msg,
            PostLikeToggleResBody(
                likeResult.isLiked,
                post.likesCount,
            ),
        )
    }

    @PutMapping("/{id}/like")
    @Transactional
    fun like(
        @PathVariable @Positive id: Int,
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

    @DeleteMapping("/{id}/like")
    @Transactional
    fun unlike(
        @PathVariable @Positive id: Int,
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
        val validPage = page.coerceAtLeast(1)
        val validPageSize = pageSize.coerceIn(1, 30)
        val postPage = postUseCase.findPagedByAuthor(rq.actor, kw, sort, validPage, validPageSize)
        return makePostDtoPage(postPage)
    }

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
}
