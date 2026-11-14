package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostLike
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query

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

    @Query("select pl.post.id, count(pl) from PostLike pl where pl.post.id in :postIds group by pl.post.id")
    fun countGroupedByPostIdIn(postIds: Collection<Long>): List<Array<Any>>

    fun deleteByPost(post: Post)
}
