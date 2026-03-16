package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.global.rsData.RsData
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.extensions.getOrThrow
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.constraints.Positive
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/post/api/v1/adm/posts")
@Tag(name = "ApiV1AdmPostController", description = "관리자용 API 글 컨트롤러")
@SecurityRequirement(name = "bearerAuth")
class ApiV1AdmPostController(
    private val postUseCase: PostUseCase,
) {
    data class AdmPostCountResBody(
        val all: Long,
        val secureTip: String,
    )

    @GetMapping("/count")
    @Transactional(readOnly = true)
    @Operation(summary = "전체 글 개수")
    fun count(): AdmPostCountResBody =
        AdmPostCountResBody(
            postUseCase.count(),
            postUseCase.randomSecureTip(),
        )

    @GetMapping
    @Transactional(readOnly = true)
    @Operation(summary = "관리자용 전체 글 목록 (숨김글 포함)")
    fun getItems(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "") kw: String,
        @RequestParam(defaultValue = "CREATED_AT") sort: PostSearchSortType1,
    ): PageDto<PostDto> {
        val validPage = page.coerceAtLeast(1)
        val validPageSize = pageSize.coerceIn(1, 30)
        val postPage = postUseCase.findPagedByKwForAdmin(kw, sort, validPage, validPageSize)
        return PageDto(postPage.map(::PostDto))
    }

    @GetMapping("/deleted")
    @Transactional(readOnly = true)
    @Operation(summary = "관리자용 soft delete 글 목록")
    fun getDeletedItems(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "30") pageSize: Int,
        @RequestParam(defaultValue = "") kw: String,
    ): PageDto<AdmDeletedPostDto> {
        val validPage = page.coerceAtLeast(1)
        val validPageSize = pageSize.coerceIn(1, 30)
        val postPage = postUseCase.findDeletedPagedByKwForAdmin(kw, validPage, validPageSize)
        return PageDto(postPage)
    }

    @PostMapping("/{id}/restore")
    @Transactional
    @Operation(summary = "관리자용 soft delete 글 복구")
    fun restoreDeletedItem(
        @PathVariable @Positive id: Int,
    ): RsData<PostDto> {
        val restoredPost = postUseCase.restoreDeletedByIdForAdmin(id)
        return RsData("200-1", "${id}번 삭제 글을 복구했습니다.", PostDto(restoredPost))
    }

    @DeleteMapping("/{id}/hard")
    @Transactional
    @Operation(summary = "관리자용 soft delete 글 영구삭제")
    fun hardDeleteDeletedItem(
        @PathVariable @Positive id: Int,
    ): RsData<Void> {
        postUseCase.hardDeleteDeletedByIdForAdmin(id)
        return RsData("200-1", "${id}번 삭제 글을 영구삭제했습니다.")
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    @Operation(summary = "관리자용 글 상세 (숨김글 포함)")
    fun getItem(
        @PathVariable id: Int,
    ): PostWithContentDto = PostWithContentDto(postUseCase.findById(id).getOrThrow())
}
