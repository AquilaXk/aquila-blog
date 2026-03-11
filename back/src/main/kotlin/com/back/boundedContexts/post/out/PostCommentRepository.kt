package com.back.boundedContexts.post.out

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import org.springframework.data.jpa.repository.EntityGraph
import org.springframework.data.jpa.repository.JpaRepository

interface PostCommentRepository : JpaRepository<PostComment, Int> {
    // 댓글 목록 DTO 매핑에서 author 접근 시 N+1이 발생하지 않도록 함께 로딩한다.
    @EntityGraph(attributePaths = ["author"])
    fun findByPostOrderByIdDesc(post: Post): List<PostComment>

    @EntityGraph(attributePaths = ["author"])
    fun findByPostAndId(post: Post, id: Int): PostComment?

    fun deleteByPost(post: Post)
}
