package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostLike
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query

/**
 * `PostLikeRepository` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface PostLikeRepository :
    JpaRepository<PostLike, Long>,
    PostLikeRepositoryCustom {
    fun findFirstByLikerAndPostOrderByIdAsc(
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

    @Modifying(flushAutomatically = true)
    @Query("delete from PostLike pl where pl.liker = :liker and pl.post = :post")
    fun deleteByLikerAndPost(
        liker: Member,
        post: Post,
    ): Int

    fun countByPost(post: Post): Long

    fun deleteByPost(post: Post)
}
