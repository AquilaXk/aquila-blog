package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.AuthSessionMemberDto
import com.back.boundedContexts.post.application.port.input.AdminPostListSnapshotUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.AdmPostBulkActionRequest
import com.back.boundedContexts.post.dto.AdmPostBulkActionResBody
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.global.rsData.RsData
import com.back.global.security.domain.SecurityUser
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.extensions.getOrThrow
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import jakarta.validation.constraints.Positive
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/post/api/v1/adm/posts")
@Tag(name = "ApiV1AdmPostController", description = "관리자용 API 글 컨트롤러")
@SecurityRequirement(name = "bearerAuth")
class ApiV1AdmPostController(
    private val postUseCase: PostUseCase,
    private val adminPostListSnapshotService: AdminPostListSnapshotUseCase,
    private val rq: com.back.global.web.application.Rq? = null,
) {
    companion object {
        const val DEFAULT_ADMIN_POST_PAGE_SIZE = 20
        private val validAdminListStatuses = setOf("all", "draft", "published", "private")
    }

    data class AdminPostsBootstrapResBody(
        val member: AuthSessionMemberDto,
        val firstPage: PageDto<PostDto>,
    )

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

    @GetMapping("/bootstrap")
    @Transactional(readOnly = true)
    @Operation(summary = "관리자 글 작업공간 bootstrap")
    fun bootstrap(
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): AdminPostsBootstrapResBody =
        AdminPostsBootstrapResBody(
            member = AuthSessionMemberDto(securityUser),
            firstPage = adminPostListSnapshotService.getFirstPageSnapshot(PostSearchSortType1.MODIFIED_AT),
        )

    @GetMapping
    @Transactional(readOnly = true)
    @Operation(summary = "관리자용 전체 글 목록 (숨김글 포함)")
    fun getItems(
        @RequestParam(defaultValue = "1") page: Int,
        @RequestParam(defaultValue = "$DEFAULT_ADMIN_POST_PAGE_SIZE") pageSize: Int,
        @RequestParam(defaultValue = "") kw: String,
        @RequestParam(defaultValue = "MODIFIED_AT") sort: PostSearchSortType1,
        @RequestParam(defaultValue = "all") status: String,
    ): PageDto<PostDto> {
        val validPage = page.coerceAtLeast(1)
        val validPageSize = pageSize.coerceIn(1, 30)
        val validStatus = status.takeIf { it in validAdminListStatuses } ?: "all"
        if (
            kw.isBlank() &&
            validPage == 1 &&
            validPageSize == DEFAULT_ADMIN_POST_PAGE_SIZE &&
            sort == PostSearchSortType1.MODIFIED_AT &&
            validStatus == "all"
        ) {
            return adminPostListSnapshotService.getFirstPageSnapshot(sort)
        }
        val postPage = postUseCase.findPagedByKwForAdmin(kw, sort, validPage, validPageSize, validStatus)
        val tempDraftPostIds = postUseCase.resolveTempDraftPostIds(postPage.content)
        return PostDto.toAdminPageDto(postPage, tempDraftPostIds)
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

    /**
     * 참조 구현: apache/answer (Apache-2.0), TryGhost/Ghost (MIT)
     * 관리자 글 일괄 처리(벌크 액션) API.
     */
    @PostMapping("/bulk")
    @Transactional
    @Operation(summary = "관리자용 글 일괄 처리")
    fun bulkAction(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @Valid @RequestBody request: AdmPostBulkActionRequest,
    ): RsData<AdmPostBulkActionResBody> {
        val actor =
            rq?.actorOrNull ?: Member(
                id = securityUser.id,
                username = securityUser.username,
                password = null,
                nickname = securityUser.nickname,
                email = null,
                admin = true,
            ).apply {
                val now = java.time.Instant.now()
                createdAt = now
                modifiedAt = now
            }
        val result = postUseCase.bulkActionForAdmin(actor, request.ids, request.action)
        return RsData("200-1", "${result.processedCount}건의 글을 일괄 처리했습니다.", result)
    }
}
