package com.back.boundedContexts.post.application.port.`in`

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.domain.postMixin.PostLikeToggleResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.springframework.data.domain.Page

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
    ): Post

    fun findById(id: Int): Post?

    fun findLatest(): Post?

    fun modify(
        actor: Member,
        post: Post,
        title: String,
        content: String,
        published: Boolean? = null,
        listed: Boolean? = null,
        expectedVersion: Long? = null,
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

    fun toggleLike(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult

    fun like(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult

    fun unlike(
        post: Post,
        actor: Member,
    ): PostLikeToggleResult

    fun incrementHit(post: Post)

    fun getComments(post: Post): List<PostComment>

    fun findCommentById(
        post: Post,
        id: Int,
    ): PostComment?

    fun isLiked(
        post: Post,
        liker: Member?,
    ): Boolean

    fun findLikedPostIds(
        liker: Member?,
        posts: List<Post>,
    ): Set<Int>

    fun findPagedByKw(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): Page<Post>

    fun findPagedByKwForAdmin(
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): Page<Post>

    fun findPagedByAuthor(
        author: Member,
        kw: String,
        sort: PostSearchSortType1,
        page: Int,
        pageSize: Int,
    ): Page<Post>

    fun findTemp(author: Member): Post?

    fun getOrCreateTemp(author: Member): Pair<Post, Boolean>
}
