package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostLike
import org.springframework.stereotype.Component

@Component
class PostLikeRepositoryAdapter(
    private val postLikeRepository: PostLikeRepository,
) : PostLikeRepositoryPort {
    override fun insertIfAbsent(
        liker: Member,
        post: Post,
    ): Long? = postLikeRepository.insertIfAbsent(liker, post)

    override fun insertIfAbsentByIds(
        likerId: Long,
        postId: Long,
    ): Long? = postLikeRepository.insertIfAbsentByIds(likerId, postId)

    override fun save(postLike: PostLike): PostLike = postLikeRepository.save(postLike)

    override fun delete(postLike: PostLike) = postLikeRepository.delete(postLike)

    override fun deleteByLikerAndPost(
        liker: Member,
        post: Post,
    ): Int = postLikeRepository.deleteByLikerAndPost(liker, post)

    override fun deleteByLikerIdAndPostId(
        likerId: Long,
        postId: Long,
    ): Int = postLikeRepository.deleteByLikerIdAndPostId(likerId, postId)

    override fun findByLikerAndPost(
        liker: Member,
        post: Post,
    ): PostLike? = postLikeRepository.findFirstByLikerAndPostOrderByIdAsc(liker, post)

    override fun existsByLikerAndPost(
        liker: Member,
        post: Post,
    ): Boolean = postLikeRepository.existsByLikerAndPost(liker, post)

    override fun findByLikerAndPostIn(
        liker: Member,
        posts: List<Post>,
    ): List<PostLike> = postLikeRepository.findByLikerAndPostIn(liker, posts)

    override fun countByPost(post: Post): Long = postLikeRepository.countByPost(post)

    override fun countByPostId(postId: Long): Long = postLikeRepository.countByPostId(postId)

    override fun countByPostIdIn(postIds: Collection<Long>): Map<Long, Long> {
        if (postIds.isEmpty()) return emptyMap()
        return postLikeRepository
            .countGroupedByPostIdIn(postIds)
            .associate { row -> (row[0] as Number).toLong() to (row[1] as Number).toLong() }
    }
}
