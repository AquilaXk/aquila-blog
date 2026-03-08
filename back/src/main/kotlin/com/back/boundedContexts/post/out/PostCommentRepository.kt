package com.back.boundedContexts.post.out

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying

interface PostCommentRepository : JpaRepository<PostComment, Int> {
    fun findByPostOrderByIdDesc(post: Post): List<PostComment>
    fun findByPostAndId(post: Post, id: Int): PostComment?

    fun deleteByPost(post: Post)
}
