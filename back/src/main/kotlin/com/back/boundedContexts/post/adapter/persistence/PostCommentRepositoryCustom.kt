package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment

interface PostCommentRepositoryCustom {
    fun findActiveSubtreeByPostAndRootCommentId(
        post: Post,
        rootCommentId: Int,
    ): List<PostComment>
}
