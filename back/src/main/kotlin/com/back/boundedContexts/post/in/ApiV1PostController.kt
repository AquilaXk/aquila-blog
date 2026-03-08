package com.back.boundedContexts.post.`in`

import com.back.boundedContexts.post.app.PostFacade
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.global.rsData.RsData
import com.back.global.web.app.Rq
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.extensions.getOrThrow
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/post/api/v1/posts")
class ApiV1PostController(
    private val postFacade: PostFacade,
    private val rq: Rq,
) {
    private fun makePostDtoPage(postPage: org.springframework.data.domain.Page<Post>): PageDto<PostDto> {
        val actor = rq.actorOrNull
        val likedPostIds = postFacade.findLikedPostIds(actor, postPage.content)

        return PageDto(
            postPage.map { post ->
                PostDto(post).apply {
                    actorHasLiked = post.id in likedPostIds
                }
            }
        )
    }

    private fun makePostWithContentDto(post: Post): PostWithContentDto {
        val actor = rq.actorOrNull
        return PostWithContentDto(post).apply {
            actorHasLiked = post.isLikedBy(actor)
            actorCanModify = post.getCheckActorCanModifyRs(actor).isSuccess
            actorCanDelete = post.getCheckActorCanDeleteRs(actor).isSuccess
        }
    }

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
        val postPage = postFacade.findPagedByKw(kw, sort, validPage, validPageSize)
        return makePostDtoPage(postPage)
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    fun getItem(@PathVariable @Positive id: Int): PostWithContentDto {
        val post = postFacade.findById(id).getOrThrow()
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
        val published: Boolean?,
        val listed: Boolean?,
    )

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    fun write(@Valid @RequestBody reqBody: PostWriteRequest): RsData<PostDto> {
        val post = postFacade.write(
            rq.actor,
            reqBody.title,
            reqBody.content,
            reqBody.published ?: false,
            reqBody.listed ?: false,
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
        val published: Boolean? = null,
        val listed: Boolean? = null,
    )

    @PutMapping("/{id}")
    @Transactional
    fun modify(
        @PathVariable @Positive id: Int,
        @Valid @RequestBody reqBody: PostModifyRequest,
    ): RsData<PostDto> {
        val post = postFacade.findById(id).getOrThrow()
        post.checkActorCanModify(rq.actor)
        postFacade.modify(post, reqBody.title, reqBody.content, reqBody.published, reqBody.listed)
        return RsData("200-1", "${post.id}번 글이 수정되었습니다.", PostDto(post))
    }

    @DeleteMapping("/{id}")
    @Transactional
    fun delete(@PathVariable @Positive id: Int): RsData<Void> {
        val post = postFacade.findById(id).getOrThrow()
        post.checkActorCanDelete(rq.actor)
        postFacade.delete(post)
        return RsData("200-1", "${id}번 글이 삭제되었습니다.")
    }

    data class PostHitResBody(val hitCount: Int)

    @PostMapping("/{id}/hit")
    @Transactional
    fun incrementHit(@PathVariable @Positive id: Int): RsData<PostHitResBody> {
        val post = postFacade.findById(id).getOrThrow()
        postFacade.incrementHit(post)
        return RsData(
            "200-1",
            "조회수가 증가했습니다.",
            PostHitResBody(post.hitCount)
        )
    }

    data class PostLikeToggleResBody(val liked: Boolean, val likesCount: Int)

    @PostMapping("/{id}/like")
    @Transactional
    fun toggleLike(@PathVariable @Positive id: Int): RsData<PostLikeToggleResBody> {
        val post = postFacade.findById(id).getOrThrow()
        val likeResult = postFacade.toggleLike(post, rq.actor)
        val msg = if (likeResult.isLiked) "좋아요를 눌렀습니다." else "좋아요를 취소했습니다."
        return RsData(
            "200-1",
            msg,
            PostLikeToggleResBody(
                likeResult.isLiked,
                post.likesCount
            )
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
        val postPage = postFacade.findPagedByAuthor(rq.actor, kw, sort, validPage, validPageSize)
        return makePostDtoPage(postPage)
    }

    @PostMapping("/temp")
    @Transactional
    fun getOrCreateTemp(response: jakarta.servlet.http.HttpServletResponse): RsData<PostWithContentDto> {
        val (post, isNew) = postFacade.getOrCreateTemp(rq.actor)
        return if (isNew) {
            response.status = 201
            RsData("201-1", "임시저장 글이 생성되었습니다.", makePostWithContentDto(post))
        } else {
            RsData("200-1", "기존 임시저장 글을 불러옵니다.", makePostWithContentDto(post))
        }
    }
}
