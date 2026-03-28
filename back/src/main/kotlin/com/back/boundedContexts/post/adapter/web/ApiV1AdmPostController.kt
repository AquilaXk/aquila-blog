package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostTagRecommendationUseCase
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
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.Size
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * ApiV1AdmPostController는 웹 계층에서 HTTP 요청/응답을 처리하는 클래스입니다.
 * 입력 DTO 검증과 응답 포맷팅을 담당하고 비즈니스 처리는 애플리케이션 계층에 위임합니다.
 */
@RestController
@RequestMapping("/post/api/v1/adm/posts")
@Tag(name = "ApiV1AdmPostController", description = "관리자용 API 글 컨트롤러")
@SecurityRequirement(name = "bearerAuth")
class ApiV1AdmPostController(
    private val postUseCase: PostUseCase,
    private val postTagRecommendationUseCase: PostTagRecommendationUseCase,
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
        return PageDto(
            postPage.map { post ->
                PostDto(post).apply {
                    tempDraft = postUseCase.isTempDraft(post)
                }
            },
        )
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
        @PathVariable @Positive id: Long,
    ): RsData<PostDto> {
        val restoredPost = postUseCase.restoreDeletedByIdForAdmin(id)
        return RsData(
            "200-1",
            "${id}번 삭제 글을 복구했습니다.",
            PostDto(restoredPost).apply {
                tempDraft = postUseCase.isTempDraft(restoredPost)
            },
        )
    }

    @DeleteMapping("/{id}/hard")
    @Transactional
    @Operation(summary = "관리자용 soft delete 글 영구삭제")
    fun hardDeleteDeletedItem(
        @PathVariable @Positive id: Long,
    ): RsData<Void> {
        postUseCase.hardDeleteDeletedByIdForAdmin(id)
        return RsData("200-1", "${id}번 삭제 글을 영구삭제했습니다.")
    }

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    @Operation(summary = "관리자용 글 상세 (숨김글 포함)")
    fun getItem(
        @PathVariable id: Long,
    ): PostWithContentDto {
        val post = postUseCase.findById(id).getOrThrow()
        return PostWithContentDto(post).apply {
            tempDraft = postUseCase.isTempDraft(post)
        }
    }

    data class RecommendTagsRequest(
        @field:Size(max = 300)
        val title: String = "",
        @field:NotBlank
        @field:Size(max = 50_000)
        val content: String,
        val existingTags: List<String> = emptyList(),
        @field:Min(3)
        @field:Max(10)
        val maxTags: Int? = null,
    )

    data class RecommendTagsResBody(
        val tags: List<String>,
        val provider: String,
        val model: String?,
        val reason: String? = null,
        val traceId: String? = null,
        val degraded: Boolean = provider == "rule",
    )

    /**
     * 생성 로직을 실행하고 실패 시 대체 경로를 적용합니다.
     * 컨트롤러 계층에서 요청 DTO를 검증한 뒤 서비스 호출 결과를 응답 규격으로 변환합니다.
     */
    @PostMapping("/recommend-tags")
    @Operation(summary = "관리자용 AI 태그 추천")
    fun recommendTags(
        @Valid @RequestBody reqBody: RecommendTagsRequest,
    ): RsData<RecommendTagsResBody> {
        val result =
            postTagRecommendationUseCase.recommend(
                title = reqBody.title,
                content = reqBody.content,
                existingTags = reqBody.existingTags,
                maxTags = reqBody.maxTags ?: 6,
            )

        val providerLabel = if (result.provider == "gemini") "AI" else "규칙 기반"

        return RsData(
            "200-1",
            "$providerLabel 태그 추천을 생성했습니다.",
            RecommendTagsResBody(
                tags = result.tags,
                provider = result.provider,
                model = result.model,
                reason = result.reason,
                traceId = result.traceId,
                degraded = result.provider == "rule",
            ),
        )
    }
}
