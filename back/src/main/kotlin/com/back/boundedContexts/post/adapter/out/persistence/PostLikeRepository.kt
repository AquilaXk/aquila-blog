package com.back.boundedContexts.post.adapter.out.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostLike
import org.springframework.data.jpa.repository.JpaRepository

interface PostLikeRepository : JpaRepository<PostLike, Int> {
    fun findByLikerAndPost(
        liker: Member,
        post: Post,
    ): PostLike?

    fun findByLikerAndPostIn(
        liker: Member,
        posts: List<Post>,
    ): List<PostLike>

    fun deleteByPost(post: Post)
}
