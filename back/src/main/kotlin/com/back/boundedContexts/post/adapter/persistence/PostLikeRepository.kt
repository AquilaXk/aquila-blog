package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostLike
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query

interface PostLikeRepository :
    JpaRepository<PostLike, Int>,
    PostLikeRepositoryCustom {
    fun findFirstByLikerAndPostOrderByIdAsc(
        liker: Member,
        post: Post,
    ): PostLike?

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
