package com.back.boundedContexts.post.`in`

import com.back.boundedContexts.member.out.shared.MemberApiClient
import com.back.boundedContexts.post.app.PostFacade
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.extensions.getOrThrow
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/post/api/v1/adm/posts")
@Tag(name = "ApiV1AdmPostController", description = "관리자용 API 글 컨트롤러")
@SecurityRequirement(name = "bearerAuth")
class ApiV1AdmPostController(
    private val postFacade: PostFacade,
    private val memberApiClient: MemberApiClient,
) {
    data class AdmPostCountResBody(val all: Long, val secureTip: String)

    @GetMapping("/count")
    @Transactional(readOnly = true)
    @Operation(summary = "전체 글 개수")
    fun count(): AdmPostCountResBody {
        return AdmPostCountResBody(
            postFacade.count(),
            memberApiClient.randomSecureTip
        )
    }

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
        val postPage = postFacade.findPagedByKwForAdmin(kw, sort, validPage, validPageSize)
        return PageDto(postPage.map(::PostDto))
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    @Operation(summary = "관리자용 글 상세 (숨김글 포함)")
    fun getItem(@PathVariable id: Int): PostWithContentDto =
        PostWithContentDto(postFacade.findById(id).getOrThrow())
}
