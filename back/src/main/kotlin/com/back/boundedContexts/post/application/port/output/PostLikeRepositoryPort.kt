package com.back.boundedContexts.post.application.port.output

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostLike

/**
 * `PostLikeRepositoryPort` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface PostLikeRepositoryPort {
    fun insertIfAbsent(
        liker: Member,
        post: Post,
    ): Long?

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

    fun existsByLikerAndPost(
        liker: Member,
        post: Post,
    ): Boolean

    fun findByLikerAndPostIn(
        liker: Member,
        posts: List<Post>,
    ): List<PostLike>

    fun countByPost(post: Post): Long
}
