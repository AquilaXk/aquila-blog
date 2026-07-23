package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostLike
import org.springframework.stereotype.Component

/**
 * PostLikeRepositoryAdapter는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
@Component
class PostLikeRepositoryAdapter(
    private val postLikeRepository: PostLikeRepository,
) : PostLikeRepositoryPort {
    override fun insertIfAbsent(
        liker: Member,
        post: Post,
    ): Long? = postLikeRepository.insertIfAbsent(liker, post)

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

    override fun existsByLikerAndPost(
        liker: Member,
        post: Post,
    ): Boolean = postLikeRepository.existsByLikerAndPost(liker, post)

    override fun findByLikerAndPostIn(
        liker: Member,
        posts: List<Post>,
    ): List<PostLike> = postLikeRepository.findByLikerAndPostIn(liker, posts)

    override fun countByPost(post: Post): Long = postLikeRepository.countByPost(post)
}
