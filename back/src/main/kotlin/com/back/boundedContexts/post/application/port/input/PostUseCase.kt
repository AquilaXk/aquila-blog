package com.back.boundedContexts.post.application.port.input

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.domain.postMixin.PostLikeToggleResult
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1

/**
 * `PostUseCase` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface PostUseCase {
    fun count(): Long

    fun randomSecureTip(): String

    fun write(
        author: Member,
        title: String,
        content: String,
        published: Boolean = false,
        listed: Boolean = false,
        idempotencyKey: String? = null,
        contentHtml: String? = null,
    ): Post

    fun findById(id: Long): Post?

    fun findLatest(): Post?

    fun modify(
        actor: Member,
        post: Post,
        title: String,
        content: String,
        published: Boolean? = null,
        listed: Boolean? = null,
        expectedVersion: Long? = null,
        contentHtml: String? = null,
    )

    fun delete(
        post: Post,
        actor: Member,
    )

    fun writeComment(
        author: Member,
        post: Post,
        content: String,
        parentComment: PostComment? = null,
    ): PostComment

    fun modifyComment(
        postComment: PostComment,
        actor: Member,
        content: String,
    )

    fun deleteComment(
        post: Post,
        postComment: PostComment,
        actor: Member,
    )

    fun like(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult

    fun unlike(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult

    fun reconcileLikeState(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult

    fun readLikeSnapshot(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult

    fun incrementHit(post: Post)

    fun getComments(
        post: Post,
        limit: Int = 200,
    ): List<PostComment>

    fun findCommentById(
        post: Post,
        id: Long,
    ): PostComment?

    fun isLiked(
        post: Post,
        liker: Member?,
    ): Boolean

    fun findLikedPostIds(
        liker: Member?,
        posts: List<Post>,
    ): Set<Long>

    fun findPagedByKw(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): PagedResult<Post>

    fun findPagedByKwForAdmin(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
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

    fun getPublicTagCounts(): List<TagCountDto>

    fun findTemp(author: Member): Post?

    fun getOrCreateTemp(author: Member): Pair<Post, Boolean>
}
