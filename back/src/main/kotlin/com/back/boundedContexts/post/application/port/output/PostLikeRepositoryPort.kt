package com.back.boundedContexts.post.application.port.output

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostLike

interface PostLikeRepositoryPort {
    fun insertIfAbsent(
        liker: Member,
        post: Post,
    ): Int?

    fun save(postLike: PostLike): PostLike

    fun delete(postLike: PostLike)

    fun deleteByLikerAndPost(
        liker: Member,
        post: Post,
    ): Int

    fun findByLikerAndPost(
        liker: Member,
        post: Post,
    ): PostLike?

    fun findByLikerAndPostIn(
        liker: Member,
        posts: List<Post>,
    ): List<PostLike>

    fun countByPost(post: Post): Long
}
