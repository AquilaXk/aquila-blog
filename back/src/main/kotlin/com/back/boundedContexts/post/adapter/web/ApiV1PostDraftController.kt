package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.PostTempDraftSaveRequest
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.global.rsData.RsData
import com.back.global.web.application.Rq
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import jakarta.validation.constraints.Positive
import org.springframework.transaction.annotation.Transactional
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * 참조 구현: TryGhost/Ghost (MIT), payloadcms/payload (MIT)
 * 서버 임시초안 단건 조회 및 비승격 자동저장 컨트롤러.
 */
@RestController
@RequestMapping("/post/api/v1/posts")
@Validated
@Tag(name = "ApiV1PostDraftController", description = "글 임시초안 API")
class ApiV1PostDraftController(
    private val postUseCase: PostUseCase,
    private val postWebDtoAssembler: PostWebDtoAssembler,
    private val rq: Rq,
) {
    @GetMapping("/temp")
    @Transactional(readOnly = true)
    @Operation(summary = "임시저장 글 단건 조회 (생성 없음)")
    fun getTemp(): RsData<PostWithContentDto?> {
        val post = postUseCase.findTemp(rq.actor)
        return if (post != null) {
            RsData("200-1", "기존 임시저장 글을 불러옵니다.", postWebDtoAssembler.makePostWithContentDto(post))
        } else {
            RsData("200-2", "임시저장 글이 없습니다.", null)
        }
    }

    @PostMapping("/temp")
    @Transactional
    @Operation(summary = "임시저장 글 조회 또는 생성")
    fun getOrCreateTemp(response: HttpServletResponse): RsData<PostWithContentDto> {
        val (post, isNew) = postUseCase.getOrCreateTemp(rq.actor)
        return if (isNew) {
            response.status = 201
            RsData("201-1", "임시저장 글이 생성되었습니다.", postWebDtoAssembler.makePostWithContentDto(post))
        } else {
            RsData("200-1", "기존 임시저장 글을 불러옵니다.", postWebDtoAssembler.makePostWithContentDto(post))
        }
    }

    @PutMapping("/temp/{id}")
    @Transactional
    @Operation(summary = "임시저장 글 비승격 자동저장")
    fun saveTempDraft(
        @PathVariable @Positive id: Long,
        @Valid @RequestBody request: PostTempDraftSaveRequest,
    ): RsData<PostWriteResultDto> {
        val post = postUseCase.saveTempDraft(rq.actor, id, request)
        return RsData("200-1", "임시저장 글이 저장되었습니다.", postWebDtoAssembler.makePostWriteResultDto(post))
    }
}
