package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.PublicPostDetailContentCacheDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class PostUseCaseAdapter(
    private val postApplicationService: PostApplicationService,
) : PostUseCase {
    override fun count(): Long = postApplicationService.count()

    override fun randomSecureTip(): String = postApplicationService.randomSecureTip()

    @Transactional
    override fun write(
        author: Member,
        title: String,
        content: String,
        published: Boolean,
        listed: Boolean,
        idempotencyKey: String?,
        contentHtml: String?,
        summary: String?,
        summaryMode: PostSummaryMode,
    ): Post =
        postApplicationService.write(
            author,
            title,
            content,
            published,
            listed,
            idempotencyKey,
            contentHtml,
            summary,
            summaryMode,
        )

    override fun findById(id: Long): Post? = postApplicationService.findById(id)

    override fun findPublicDetailById(id: Long): Post? = postApplicationService.findPublicDetailById(id)

    override fun findPublicDetailContentById(id: Long): PublicPostDetailContentCacheDto? =
        postApplicationService.findPublicDetailContentById(id)

    override fun findLatest(): Post? = postApplicationService.findLatest()

    @Transactional
    override fun modify(
        actor: Member,
        post: Post,
        title: String,
        content: String,
        published: Boolean?,
        listed: Boolean?,
        expectedVersion: Long,
        contentHtml: String?,
        summary: String?,
        summaryMode: PostSummaryMode?,
    ) {
        postApplicationService.modify(
            actor,
            post,
            title,
            content,
            published,
            listed,
            expectedVersion,
            contentHtml,
            summary,
            summaryMode,
        )
    }

    override fun delete(
        post: Post,
        actor: Member,
    ) = postApplicationService.delete(post, actor)

    override fun incrementHit(post: Post) = postApplicationService.incrementHit(post)

    override fun findPagedByKw(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): PagedResult<Post> = postApplicationService.findPagedByKw(kw, sort, page, pageSize)

    override fun findRecommendedExplorePage(
        page: Int,
        pageSize: Int,
    ): PagedResult<Post> = postApplicationService.findRecommendedExplorePage(page, pageSize)

    override fun findPagedByKwForAdmin(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
        status: String,
    ): PagedResult<Post> = postApplicationService.findPagedByKwForAdmin(kw, sort, page, pageSize, status)

    override fun findDeletedPagedByKwForAdmin(
        kw: String,
        page: Int,
        pageSize: Int,
    ): PagedResult<AdmDeletedPostDto> = postApplicationService.findDeletedPagedByKwForAdmin(kw, page, pageSize)

    override fun restoreDeletedByIdForAdmin(id: Long): Post = postApplicationService.restoreDeletedByIdForAdmin(id)

    override fun hardDeleteDeletedByIdForAdmin(id: Long) = postApplicationService.hardDeleteDeletedByIdForAdmin(id)

    override fun findPagedByAuthor(
        author: Member,
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): PagedResult<Post> = postApplicationService.findPagedByAuthor(author, kw, sort, page, pageSize)

    override fun findPagedByKwAndTag(
        kw: String,
        tag: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): PagedResult<Post> = postApplicationService.findPagedByKwAndTag(kw, tag, sort, page, pageSize)

    override fun findPublicByCursor(
        cursorSortValue: Long?,
        cursorId: Long?,
        limit: Int,
        sort: PostSearchSortType1,
    ): List<Post> = postApplicationService.findPublicByCursor(cursorSortValue, cursorId, limit, sort)

    override fun findPublicByTagCursor(
        tag: String,
        cursorSortValue: Long?,
        cursorId: Long?,
        limit: Int,
        sort: PostSearchSortType1,
    ): List<Post> = postApplicationService.findPublicByTagCursor(tag, cursorSortValue, cursorId, limit, sort)

    override fun findPublicByAuthorExceptPost(
        authorId: Long,
        excludePostId: Long?,
        limit: Int,
    ): List<Post> = postApplicationService.findPublicByAuthorExceptPost(authorId, excludePostId, limit)

    override fun getPublicTagCounts(): List<TagCountDto> = postApplicationService.getPublicTagCounts()

    override fun findTemp(author: Member): Post? = postApplicationService.findTemp(author)

    override fun getOrCreateTemp(author: Member): Pair<Post, Boolean> = postApplicationService.getOrCreateTemp(author)

    override fun isTempDraft(post: Post): Boolean = postApplicationService.isTempDraft(post)
}
