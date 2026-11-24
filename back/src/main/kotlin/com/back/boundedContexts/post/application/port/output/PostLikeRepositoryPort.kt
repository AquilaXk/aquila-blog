package com.back.boundedContexts.post.application.port.output

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostLike

interface PostLikeRepositoryPort {
    fun insertIfAbsent(
        liker: Member,
        post: Post,
    ): Long?

    fun insertIfAbsentByIds(
        likerId: Long,
        postId: Long,
    ): Long? = error("insertIfAbsentByIds not implemented")

    fun save(postLike: PostLike): PostLike

    fun delete(postLike: PostLike)

    fun deleteByLikerAndPost(
        liker: Member,
        post: Post,
    ): Int

    fun deleteByLikerIdAndPostId(
        likerId: Long,
        postId: Long,
    ): Int = error("deleteByLikerIdAndPostId not implemented")

    fun findByLikerAndPost(
        liker: Member,
        post: Post,
    ): PostLike?

    fun existsByLikerAndPost(
        liker: Member,
        post: Post,
    ): Boolean

    fun findByLikerAndPostIn(
        liker: Member,
        posts: List<Post>,
    ): List<PostLike>

    fun countByPost(post: Post): Long

    fun countByPostId(postId: Long): Long = error("countByPostId not implemented")

    fun countByPostIdIn(postIds: Collection<Long>): Map<Long, Long>
}
