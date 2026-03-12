package com.back.boundedContexts.post.application.port.out

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment

interface PostCommentRepositoryPort {
    fun save(comment: PostComment): PostComment

    fun findByPostOrderByCreatedAtAscIdAsc(post: Post): List<PostComment>

    fun findByPostAndId(
        post: Post,
        id: Int,
    ): PostComment?
}
