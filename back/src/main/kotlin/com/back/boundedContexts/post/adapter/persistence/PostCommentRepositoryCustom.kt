package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.application.port.output.PostCommentAccountDeletionTarget
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment

interface PostCommentRepositoryCustom {
    fun findActiveSubtreeByPostAndRootCommentId(
        post: Post,
        rootCommentId: Long,
    ): List<PostComment>

    fun findActiveSubtreeByPostIdAndRootCommentId(
        postId: Long,
        rootCommentId: Long,
    ): List<PostComment>

    fun findActiveAccountDeletionTargetsByAuthorId(authorId: Long): List<PostCommentAccountDeletionTarget>
}
