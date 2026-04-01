package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.domain.postMixin.PostLikeToggleResult
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.PublicPostDetailContentCacheDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.springframework.stereotype.Service
import java.time.Instant

/**
 * PostUseCaseAdapter는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class PostUseCaseAdapter(
    private val postApplicationService: PostApplicationService,
) : PostUseCase {
    override fun count(): Long = postApplicationService.count()

    override fun randomSecureTip(): String = postApplicationService.randomSecureTip()

    override fun write(
        author: Member,
        title: String,
        content: String,
        published: Boolean,
        listed: Boolean,
        idempotencyKey: String?,
        contentHtml: String?,
    ): Post = postApplicationService.write(author, title, content, published, listed, idempotencyKey, contentHtml)

    override fun findById(id: Long): Post? = postApplicationService.findById(id)

    override fun findPublicDetailById(id: Long): Post? = postApplicationService.findPublicDetailById(id)

    override fun findPublicDetailContentById(id: Long): PublicPostDetailContentCacheDto? =
        postApplicationService.findPublicDetailContentById(id)

    override fun findLatest(): Post? = postApplicationService.findLatest()

    override fun modify(
        actor: Member,
        post: Post,
        title: String,
        content: String,
        published: Boolean?,
        listed: Boolean?,
        expectedVersion: Long,
        contentHtml: String?,
    ) = postApplicationService.modify(actor, post, title, content, published, listed, expectedVersion, contentHtml)

    override fun delete(
        post: Post,
        actor: Member,
    ) = postApplicationService.delete(post, actor)

    override fun writeComment(
        author: Member,
        post: Post,
        content: String,
        parentComment: PostComment?,
    ): PostComment = postApplicationService.writeComment(author, post, content, parentComment)

    override fun modifyComment(
        postComment: PostComment,
        actor: Member,
        content: String,
    ) = postApplicationService.modifyComment(postComment, actor, content)

    override fun deleteComment(
        post: Post,
        postComment: PostComment,
        actor: Member,
    ) = postApplicationService.deleteComment(post, postComment, actor)

    override fun like(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult = postApplicationService.like(post, actor)

    override fun unlike(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult = postApplicationService.unlike(post, actor)

    override fun reconcileLikeState(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult = postApplicationService.reconcileLikeState(post, actor)

    override fun readLikeSnapshot(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult = postApplicationService.readLikeSnapshot(post, actor)

    override fun incrementHit(post: Post) = postApplicationService.incrementHit(post)

    override fun getComments(
        post: Post,
        limit: Int,
    ): List<PostComment> = postApplicationService.getComments(post, limit)

    override fun findCommentById(
        post: Post,
        id: Long,
    ): PostComment? = postApplicationService.findCommentById(post, id)

    override fun isLiked(
        post: Post,
        liker: Member?,
    ): Boolean = postApplicationService.isLiked(post, liker)

    override fun findLikedPostIds(
        liker: Member?,
        posts: List<Post>,
    ): Set<Long> = postApplicationService.findLikedPostIds(liker, posts)

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
    ): PagedResult<Post> = postApplicationService.findPagedByKwForAdmin(kw, sort, page, pageSize)

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
        cursorCreatedAt: Instant?,
        cursorId: Long?,
        limit: Int,
        sort: PostSearchSortType1,
    ): List<Post> = postApplicationService.findPublicByCursor(cursorCreatedAt, cursorId, limit, sort)

    override fun findPublicByTagCursor(
        tag: String,
        cursorCreatedAt: Instant?,
        cursorId: Long?,
        limit: Int,
        sort: PostSearchSortType1,
    ): List<Post> = postApplicationService.findPublicByTagCursor(tag, cursorCreatedAt, cursorId, limit, sort)

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
