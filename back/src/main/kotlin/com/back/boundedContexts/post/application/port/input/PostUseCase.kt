package com.back.boundedContexts.post.application.port.input

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.PublicPostDetailContentCacheDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.boundedContexts.post.model.PostSummarySource
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1

interface PostUseCase {
    data class SummaryPreviewResult(
        val summary: String,
        val source: PostSummarySource,
        val contentHash: String,
        val algorithmVersion: String,
    )

    data class SummaryBackfillResult(
        val scanned: Int,
        val updated: Int,
        val skipped: Int,
        val nextAfterId: Long,
        val hasMore: Boolean,
        val dryRun: Boolean,
    )

    fun count(): Long

    fun randomSecureTip(): String

    fun previewSummary(
        title: String,
        content: String,
    ): SummaryPreviewResult

    fun backfillSummaries(
        afterId: Long,
        maxId: Long,
        limit: Int,
        dryRun: Boolean,
    ): SummaryBackfillResult

    fun write(
        author: Member,
        title: String,
        content: String,
        published: Boolean = false,
        listed: Boolean = false,
        idempotencyKey: String? = null,
        contentHtml: String? = null,
        summary: String? = null,
        summaryMode: PostSummaryMode? = null,
    ): Post

    fun findById(id: Long): Post?

    fun findPublicDetailById(id: Long): Post?

    fun findPublicDetailContentById(id: Long): PublicPostDetailContentCacheDto?

    fun findLatest(): Post?

    fun modify(
        actor: Member,
        post: Post,
        title: String,
        content: String,
        published: Boolean? = null,
        listed: Boolean? = null,
        expectedVersion: Long,
        contentHtml: String? = null,
        summary: String? = null,
        summaryMode: PostSummaryMode? = null,
    )

    fun delete(
        post: Post,
        actor: Member,
    )

    fun deleteContentByAuthorForAccountDeletion(author: Member)

    fun incrementHit(post: Post)

    fun findPagedByKw(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): PagedResult<Post>

    fun findRecommendedExplorePage(
        page: Int,
        pageSize: Int,
    ): PagedResult<Post>

    fun findPagedByKwForAdmin(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
        status: String = "all",
    ): PagedResult<Post>

    fun findDeletedPagedByKwForAdmin(
        kw: String,
        page: Int,
        pageSize: Int,
    ): PagedResult<AdmDeletedPostDto>

    fun restoreDeletedByIdForAdmin(id: Long): Post

    fun hardDeleteDeletedByIdForAdmin(id: Long)

    fun findPagedByAuthor(
        author: Member,
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): PagedResult<Post>

    fun findPagedByKwAndTag(
        kw: String,
        tag: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): PagedResult<Post>

    fun findPublicByCursor(
        cursorSortValue: Long?,
        cursorId: Long?,
        limit: Int,
        sort: PostSearchSortType1,
    ): List<Post>

    fun findPublicByTagCursor(
        tag: String,
        cursorSortValue: Long?,
        cursorId: Long?,
        limit: Int,
        sort: PostSearchSortType1,
    ): List<Post>

    fun findPublicByAuthorExceptPost(
        authorId: Long,
        excludePostId: Long?,
        limit: Int,
    ): List<Post>

    fun getPublicTagCounts(): List<TagCountDto>

    fun findTemp(author: Member): Post?

    fun getOrCreateTemp(author: Member): Pair<Post, Boolean>

    fun isTempDraft(post: Post): Boolean
}
