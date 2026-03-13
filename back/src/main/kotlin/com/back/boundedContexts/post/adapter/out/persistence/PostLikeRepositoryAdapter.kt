package com.back.boundedContexts.post.adapter.out.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.out.PostLikeRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostLike
import org.springframework.stereotype.Component

@Component
class PostLikeRepositoryAdapter(
    private val postLikeRepository: PostLikeRepository,
) : PostLikeRepositoryPort {
    override fun save(postLike: PostLike): PostLike = postLikeRepository.save(postLike)

    override fun delete(postLike: PostLike) = postLikeRepository.delete(postLike)

    override fun deleteByLikerAndPost(
        liker: Member,
        post: Post,
    ): Int = postLikeRepository.deleteByLikerAndPost(liker, post)

    override fun findByLikerAndPost(
        liker: Member,
        post: Post,
    ): PostLike? = postLikeRepository.findFirstByLikerAndPostOrderByIdAsc(liker, post)

    override fun findByLikerAndPostIn(
        liker: Member,
        posts: List<Post>,
    ): List<PostLike> = postLikeRepository.findByLikerAndPostIn(liker, posts)

    override fun countByPost(post: Post): Long = postLikeRepository.countByPost(post)
}
