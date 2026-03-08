package com.back.boundedContexts.post.out

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostLike
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying

interface PostLikeRepository : JpaRepository<PostLike, Int> {
    fun findByLikerAndPost(liker: Member, post: Post): PostLike?
    fun findByLikerAndPostIn(liker: Member, posts: List<Post>): List<PostLike>

    fun deleteByPost(post: Post)
}
