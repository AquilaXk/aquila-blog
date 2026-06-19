package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.PostDto
import com.back.global.rsData.RsData
import com.back.global.web.application.Rq
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.extensions.getOrThrow
import jakarta.validation.Valid
import jakarta.validation.constraints.Positive
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/post/api/v1/posts")
class ApiV1PostCommandController(
    private val postUseCase: PostUseCase,
    private val postSearchIntentResolver: PostSearchIntentResolver,
    private val postWebDtoAssembler: PostWebDtoAssembler,
    private val rq: Rq,
) {
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

    @PutMapping("/{id}")
    @Transactional
    fun modify(
        @PathVariable @Positive id: Long,
        @Valid @RequestBody reqBody: PostModifyRequest,
    ): RsData<PostWriteResultDto> {
        val post = postUseCase.findById(id).getOrThrow()
        val actor = rq.actor
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
        return RsData("200-1", "${post.id}번 글이 수정되었습니다.", postWebDtoAssembler.makePostWriteResultDto(post))
    }

    @DeleteMapping("/{id}")
    @Transactional
    fun delete(
        @PathVariable @Positive id: Long,
    ): RsData<Void> {
        val post = postUseCase.findById(id).getOrThrow()
        val actor = rq.actor
        postUseCase.delete(post, actor)
        return RsData("200-1", "${id}번 글이 삭제되었습니다.")
    }

    @GetMapping("/mine")
    @Transactional(readOnly = true)
    fun getMine(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "") kw: String,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): PageDto<PostDto> {
        val validPage = page.coerceIn(1, MAX_PUBLIC_PAGE)
        val validPageSize = pageSize.coerceIn(1, 30)
        val postPage =
            postUseCase.findPagedByAuthor(
                rq.actor,
                postSearchIntentResolver.normalizeKeyword(kw),
                sort,
                validPage,
                validPageSize,
            )
        return postWebDtoAssembler.makePostDtoPage(postPage)
    }

    companion object {
        private const val MAX_PUBLIC_PAGE = 200
    }
}
