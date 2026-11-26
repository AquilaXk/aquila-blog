package com.back.boundedContexts.post.application.port.input

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.AdmPostFacetCounts
import com.back.boundedContexts.post.dto.PostInteractionReadStateDto
import com.back.boundedContexts.post.dto.PostRevisionSnapshotDto
import com.back.boundedContexts.post.dto.PostRevisionSummaryDto
import com.back.boundedContexts.post.dto.PublicBacklinkCandidateProjection
import com.back.boundedContexts.post.dto.PublicPostDetailContentCacheDto
import com.back.boundedContexts.post.dto.PublicSeriesPostItemDto
import com.back.boundedContexts.post.dto.PublicSitemapPostItemDto
import com.back.boundedContexts.post.dto.PublicWikilinkCatalogItemDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import java.time.Instant

interface PostUseCase {
    fun count(): Long

    fun getAdminPostFacetCounts(): AdmPostFacetCounts

    fun randomSecureTip(): String

    fun write(
        author: Member,
        title: String,
        content: String,
        published: Boolean = false,
        listed: Boolean = false,
        idempotencyKey: String? = null,
        contentHtml: String? = null,
        summary: String? = null,
        summaryMode: PostSummaryMode,
        scheduledAt: Instant? = null,
        seriesName: String? = null,
        seriesOrder: Int? = null,
        canonicalUrl: String? = null,
    ): Post

    fun findById(id: Long): Post?

    fun findByIdForUpdate(id: Long): Post? = findById(id)

    fun findPublicDetailById(id: Long): Post?

    fun isPublicDetailReadable(id: Long): Boolean

    fun findPublicDetailContentById(id: Long): PublicPostDetailContentCacheDto?

    fun findLatest(): Post?

    fun findInteractionReadStateById(id: Long): PostInteractionReadStateDto?

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
        scheduledAt: Instant? = null,
        seriesName: String? = null,
        seriesOrder: Int? = null,
        canonicalUrl: String? = null,
        updatePublishingMetadata: Boolean = false,
    )

    fun delete(
        post: Post,
        actor: Member,
    )

    fun incrementHit(post: Post)

    fun incrementHit(postId: Long): Int = error("incrementHit(postId) not implemented")

    fun incrementLike(post: Post)

    fun incrementLike(postId: Long): Int = error("incrementLike(postId) not implemented")

    fun decrementLike(post: Post)

    fun decrementLike(postId: Long): Int = error("decrementLike(postId) not implemented")

    fun likePost(
        postId: Long,
        memberId: Long,
    ): Int = error("likePost(postId, memberId) not implemented")

    fun unlikePost(
        postId: Long,
        memberId: Long,
    ): Int = error("unlikePost(postId, memberId) not implemented")

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

    fun findRecommendedExplorePage(
        page: Int,
        pageSize: Int,
        preloadedTagCounts: List<TagCountDto>?,
    ): PagedResult<Post> = findRecommendedExplorePage(page, pageSize)

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

    fun findAdjacentPublicPosts(
        createdAt: Instant,
        id: Long,
    ): Pair<Post?, Post?>

    fun getPublicTagCounts(): List<TagCountDto>

    fun findTemp(author: Member): Post?

    fun getOrCreateTemp(author: Member): Pair<Post, Boolean>

    fun saveTempDraft(
        actor: Member,
        postId: Long,
        request: com.back.boundedContexts.post.dto.PostTempDraftSaveRequest,
    ): Post

    fun isTempDraft(post: Post): Boolean

    fun resolveTempDraftPostIds(posts: List<Post>): Set<Long>

    fun bulkActionForAdmin(
        actor: Member,
        ids: List<Long>,
        action: com.back.boundedContexts.post.dto.AdmPostBulkActionType,
    ): com.back.boundedContexts.post.dto.AdmPostBulkActionResBody

    fun getPublicSitemapItems(limit: Int): List<PublicSitemapPostItemDto>

    fun getPublicWikilinkCatalogItems(limit: Int): List<PublicWikilinkCatalogItemDto> = emptyList()

    fun findPublicBacklinkCandidates(
        targetPostId: Long,
        limit: Int,
    ): List<PublicBacklinkCandidateProjection> = emptyList()

    fun getPostRevisionsForAdmin(postId: Long): List<PostRevisionSummaryDto>

    fun getPostRevisionSnapshotForAdmin(
        postId: Long,
        revisionId: Long,
    ): PostRevisionSnapshotDto

    fun restorePostRevisionForAdmin(
        actor: Member,
        postId: Long,
        revisionId: Long,
    ): Post

    fun restorePostRevisionForAdmin(
        actor: Member,
        postId: Long,
        revisionId: Long,
        expectedVersion: Long?,
    ): Post = error("restorePostRevisionForAdmin with expectedVersion not implemented")

    fun listTempDrafts(author: Member): List<Post> = emptyList()

    fun createNewTempDraft(author: Member): Post = error("createNewTempDraft not implemented")

    fun deleteTempDraft(
        author: Member,
        postId: Long,
    ): Unit = error("deleteTempDraft not implemented")

    fun listSeriesNames(author: Member): List<String> = emptyList()

    fun findPublishedSeriesPosts(seriesName: String): List<PublicSeriesPostItemDto> = emptyList()
}
