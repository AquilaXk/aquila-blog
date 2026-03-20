package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.dto.PostCommentDto
import com.back.global.rsData.RsData
import com.back.global.web.application.Rq
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

/**
 * ApiV1PostCommentController는 웹 계층에서 HTTP 요청/응답을 처리하는 클래스입니다.
 * 입력 DTO 검증과 응답 포맷팅을 담당하고 비즈니스 처리는 애플리케이션 계층에 위임합니다.
 */
@RestController
@RequestMapping("/post/api/v1/posts/{postId}/comments")
class ApiV1PostCommentController(
    private val postUseCase: PostUseCase,
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
    fun getItems(
        @PathVariable postId: Long,
        @org.springframework.web.bind.annotation.RequestParam(defaultValue = "200") limit: Int,
    ): List<PostCommentDto> {
        val post = postUseCase.findById(postId).getOrThrow()
        post.checkActorCanRead(rq.actorOrNull)
        val safeLimit = limit.coerceIn(1, 500)
        return postUseCase.getComments(post, safeLimit).map { makePostCommentDto(it) }
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    fun getItem(
        @PathVariable postId: Long,
        @PathVariable id: Long,
    ): PostCommentDto {
        val post = postUseCase.findById(postId).getOrThrow()
        post.checkActorCanRead(rq.actorOrNull)
        val postComment = postUseCase.findCommentById(post, id).getOrThrow()
        return makePostCommentDto(postComment)
    }

    data class PostCommentWriteRequest(
        @field:NotBlank
        @field:Size(min = 2, max = 100)
        val content: String,
        val parentCommentId: Long? = null,
    )

    /**
     * 생성 요청을 처리하고 멱등성·후속 동기화 절차를 함께 수행합니다.
     * 컨트롤러 계층에서 요청 DTO를 검증한 뒤 서비스 호출 결과를 응답 규격으로 변환합니다.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    fun write(
        @PathVariable postId: Long,
        @Valid @RequestBody reqBody: PostCommentWriteRequest,
    ): RsData<PostCommentDto> {
        val post = postUseCase.findById(postId).getOrThrow()
        post.checkActorCanRead(rq.actorOrNull)
        val parentComment =
            reqBody.parentCommentId?.let { parentId ->
                postUseCase.findCommentById(post, parentId).getOrThrow()
            }
        val postComment =
            postUseCase.writeComment(
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
        @PathVariable postId: Long,
        @PathVariable id: Long,
        @Valid @RequestBody reqBody: PostCommentModifyRequest,
    ): RsData<Void> {
        val post = postUseCase.findById(postId).getOrThrow()
        post.checkActorCanRead(rq.actorOrNull)
        val postComment = postUseCase.findCommentById(post, id).getOrThrow()
        postComment.checkActorCanModify(rq.actor)
        postUseCase.modifyComment(postComment, rq.actor, reqBody.content)
        return RsData("200-1", "${id}번 댓글이 수정되었습니다.")
    }

    @DeleteMapping("/{id}")
    @Transactional
    fun delete(
        @PathVariable postId: Long,
        @PathVariable id: Long,
    ): RsData<Void> {
        val post = postUseCase.findById(postId).getOrThrow()
        post.checkActorCanRead(rq.actorOrNull)
        val postComment = postUseCase.findCommentById(post, id).getOrThrow()
        postComment.checkActorCanDelete(rq.actor)
        postUseCase.deleteComment(post, postComment, rq.actor)
        return RsData("200-1", "${id}번 댓글이 삭제되었습니다.")
    }
}
