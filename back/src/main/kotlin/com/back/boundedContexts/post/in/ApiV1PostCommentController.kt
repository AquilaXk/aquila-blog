package com.back.boundedContexts.post.`in`

import com.back.boundedContexts.post.app.PostFacade
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.dto.PostCommentDto
import com.back.global.rsData.RsData
import com.back.global.web.app.Rq
import com.back.standard.extensions.getOrThrow
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/post/api/v1/posts/{postId}/comments")
class ApiV1PostCommentController(
    private val postFacade: PostFacade,
    private val rq: Rq,
) {
    private fun makePostCommentDto(postComment: PostComment): PostCommentDto {
        val actor = rq.actorOrNull
        return PostCommentDto(postComment).apply {
            actorCanModify = postComment.getCheckActorCanModifyRs(actor).isSuccess
            actorCanDelete = postComment.getCheckActorCanDeleteRs(actor).isSuccess
        }
    }

    @GetMapping
    @Transactional(readOnly = true)
    fun getItems(@PathVariable postId: Int): List<PostCommentDto> {
        val post = postFacade.findById(postId).getOrThrow()
        post.checkActorCanRead(rq.actorOrNull)
        return postFacade.getComments(post).map { makePostCommentDto(it) }
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    fun getItem(
        @PathVariable postId: Int,
        @PathVariable id: Int,
    ): PostCommentDto {
        val post = postFacade.findById(postId).getOrThrow()
        post.checkActorCanRead(rq.actorOrNull)
        val postComment = postFacade.findCommentById(post, id).getOrThrow()
        return makePostCommentDto(postComment)
    }

    data class PostCommentWriteRequest(
        @field:NotBlank
        @field:Size(min = 2, max = 100)
        val content: String,
        val parentCommentId: Int? = null,
    )

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    fun write(
        @PathVariable postId: Int,
        @Valid @RequestBody reqBody: PostCommentWriteRequest,
    ): RsData<PostCommentDto> {
        val post = postFacade.findById(postId).getOrThrow()
        val parentComment = reqBody.parentCommentId?.let { parentId ->
            postFacade.findCommentById(post, parentId).getOrThrow()
        }
        val postComment = postFacade.writeComment(
            author = rq.actor,
            post = post,
            content = reqBody.content,
            parentComment = parentComment,
        )
        return RsData("201-1", "${postComment.id}번 댓글이 작성되었습니다.", makePostCommentDto(postComment))
    }

    data class PostCommentModifyRequest(
        @field:NotBlank
        @field:Size(min = 2, max = 100)
        val content: String,
    )

    @PutMapping("/{id}")
    @Transactional
    fun modify(
        @PathVariable postId: Int,
        @PathVariable id: Int,
        @Valid @RequestBody reqBody: PostCommentModifyRequest,
    ): RsData<Void> {
        val post = postFacade.findById(postId).getOrThrow()
        val postComment = postFacade.findCommentById(post, id).getOrThrow()
        postComment.checkActorCanModify(rq.actor)
        postFacade.modifyComment(postComment, rq.actor, reqBody.content)
        return RsData("200-1", "${id}번 댓글이 수정되었습니다.")
    }

    @DeleteMapping("/{id}")
    @Transactional
    fun delete(
        @PathVariable postId: Int,
        @PathVariable id: Int,
    ): RsData<Void> {
        val post = postFacade.findById(postId).getOrThrow()
        val postComment = postFacade.findCommentById(post, id).getOrThrow()
        postComment.checkActorCanDelete(rq.actor)
        postFacade.deleteComment(post, postComment, rq.actor)
        return RsData("200-1", "${id}번 댓글이 삭제되었습니다.")
    }
}
