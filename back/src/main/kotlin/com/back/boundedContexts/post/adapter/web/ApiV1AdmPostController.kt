package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.AuthSessionMemberDto
import com.back.boundedContexts.post.application.port.input.AdminPostListSnapshotUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.AdmPostBulkActionRequest
import com.back.boundedContexts.post.dto.AdmPostBulkActionResBody
import com.back.boundedContexts.post.dto.AdmPostRevisionRestoreRequest
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostRevisionSnapshotDto
import com.back.boundedContexts.post.dto.PostRevisionSummaryDto
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
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Positive
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/**
 * 참조 구현: TryGhost/Ghost (MIT) & payloadcms/payload (MIT) — Admin post list unlisted status filter
 */
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
        private val validAdminListStatuses = setOf("all", "draft", "published", "private", "unlisted")
    }

    data class AdminPostsBootstrapResBody(
        val member: AuthSessionMemberDto,
        val firstPage: PageDto<PostDto>,
    )

    data class AdmPostCountResBody(
        val all: Long,
        val secureTip: String,
        val published: Long,
        val draft: Long,
        val privateCount: Long,
        val unlisted: Long,
        val deleted: Long,
    )

    @GetMapping("/count")
    @Transactional(readOnly = true)
    @Operation(summary = "전체 글 개수")
    fun count(): AdmPostCountResBody {
        val facet = postUseCase.getAdminPostFacetCounts()
        return AdmPostCountResBody(
            all = facet.all,
            secureTip = postUseCase.randomSecureTip(),
            published = facet.published,
            draft = facet.draft,
            privateCount = facet.privateCount,
            unlisted = facet.unlisted,
            deleted = facet.deleted,
        )
    }

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

    @GetMapping("/temp")
    @Transactional(readOnly = true)
    @Operation(summary = "관리자용 임시초안 목록")
    fun listTempDrafts(
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): List<PostDto> = postUseCase.listTempDrafts(resolveAdminActor(securityUser)).map(::PostDto)

    @PostMapping("/temp")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    @Operation(summary = "관리자용 새 임시초안 생성")
    fun createNewTempDraft(
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): RsData<PostWithContentDto> {
        val post = postUseCase.createNewTempDraft(resolveAdminActor(securityUser))
        val dto =
            PostWithContentDto(post).apply {
                tempDraft = true
                actorCanModify = true
                actorCanDelete = true
            }
        return RsData("201-1", "${post.id}번 임시 저장글이 생성되었습니다.", dto)
    }

    @DeleteMapping("/temp/{id}")
    @Transactional
    @Operation(summary = "관리자용 임시초안 삭제")
    fun deleteTempDraft(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable @Positive id: Long,
    ): RsData<Void> {
        postUseCase.deleteTempDraft(resolveAdminActor(securityUser), id)
        return RsData("200-1", "${id}번 임시 저장글을 삭제했습니다.")
    }

    @GetMapping("/series")
    @Transactional(readOnly = true)
    @Operation(summary = "관리자용 연재 시리즈 목록")
    fun listSeries(
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): List<String> = postUseCase.listSeriesNames(resolveAdminActor(securityUser))

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    @Operation(summary = "관리자용 글 상세 (숨김글 포함)")
    fun getItem(
        @PathVariable id: Long,
    ): PostWithContentDto {
        val post = postUseCase.findById(id).getOrThrow()
        return PostWithContentDto(post).apply {
            tempDraft = postUseCase.isTempDraft(post)
            actorCanModify = true
            actorCanDelete = true
        }
    }

    /**
     * 참조 구현: TryGhost/Ghost (MIT) & payloadcms/payload (MIT) — 게시글 리비전 히스토리 목록 조회 및 복원 API
     */
    @GetMapping("/{id}/revisions")
    @Transactional(readOnly = true)
    @Operation(summary = "관리자용 글 리비전 히스토리 목록")
    fun getRevisions(
        @PathVariable @Positive id: Long,
    ): List<PostRevisionSummaryDto> = postUseCase.getPostRevisionsForAdmin(id)

    @GetMapping("/{id}/revisions/{revisionId}")
    @Transactional(readOnly = true)
    @Operation(summary = "관리자용 글 리비전 단건 스냅샷 조회")
    fun getRevisionSnapshot(
        @PathVariable @Positive id: Long,
        @PathVariable @Positive revisionId: Long,
    ): PostRevisionSnapshotDto = postUseCase.getPostRevisionSnapshotForAdmin(id, revisionId)

    @PostMapping("/{id}/revisions/{revisionId}/restore")
    @Transactional
    @Operation(summary = "관리자용 글 리비전 복원")
    fun restoreRevision(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable @Positive id: Long,
        @PathVariable @Positive revisionId: Long,
        @RequestParam(required = false) @Min(0) expectedVersion: Long? = null,
        @Valid @RequestBody(required = false) request: AdmPostRevisionRestoreRequest? = null,
    ): RsData<PostWithContentDto> {
        val actor = resolveAdminActor(securityUser)
        val resolvedExpectedVersion = expectedVersion ?: request?.expectedVersion
        val restoredPost =
            if (resolvedExpectedVersion == null) {
                postUseCase.restorePostRevisionForAdmin(actor, id, revisionId)
            } else {
                postUseCase.restorePostRevisionForAdmin(actor, id, revisionId, resolvedExpectedVersion)
            }
        val dto =
            PostWithContentDto(restoredPost).apply {
                tempDraft = postUseCase.isTempDraft(restoredPost)
            }
        return RsData("200-1", "${id}번 글을 ${revisionId}번 리비전으로 복원했습니다.", dto)
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
        val actor = resolveAdminActor(securityUser)
        val result = postUseCase.bulkActionForAdmin(actor, request.ids, request.action)
        return RsData("200-1", "${result.processedCount}건의 글을 일괄 처리했습니다.", result)
    }

    private fun resolveAdminActor(securityUser: SecurityUser): Member =
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
}
