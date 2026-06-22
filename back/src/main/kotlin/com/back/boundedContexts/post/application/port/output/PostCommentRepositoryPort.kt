package com.back.boundedContexts.post.application.port.output

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import java.util.Optional

interface PostCommentAccountDeletionTarget {
    val comment: PostComment
    val postId: Long
    val postDeleted: Boolean
}

interface PostCommentRepositoryPort {
    fun save(comment: PostComment): PostComment

    fun findByPostOrderByCreatedAtAscIdAsc(post: Post): List<PostComment>

    fun findByPostOrderByCreatedAtAscIdAsc(
        post: Post,
        limit: Int,
    ): List<PostComment>

    fun findActiveSubtreeByPostAndRootCommentId(
        post: Post,
        rootCommentId: Long,
    ): List<PostComment>

    fun findActiveSubtreeByPostIdAndRootCommentId(
        postId: Long,
        rootCommentId: Long,
    ): List<PostComment>

    fun findActiveAccountDeletionTargetsByAuthorId(authorId: Long): List<PostCommentAccountDeletionTarget>

    fun decrementPostCommentsCountByPostId(
        postId: Long,
        count: Int,
    ): Int

    fun findByPostAndId(
        post: Post,
        id: Long,
    ): PostComment?

    fun findById(id: Long): Optional<PostComment>
}
