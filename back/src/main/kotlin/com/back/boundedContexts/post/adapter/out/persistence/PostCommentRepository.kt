package com.back.boundedContexts.post.adapter.out.persistence

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import org.springframework.data.jpa.repository.EntityGraph
import org.springframework.data.jpa.repository.JpaRepository
import java.util.Optional

interface PostCommentRepository :
    JpaRepository<PostComment, Int>,
    PostCommentRepositoryCustom {
    /**
     * 댓글 목록 DTO 매핑 시 author / parentComment lazy-load로 인한 N+1을 피한다.
     */
    @EntityGraph(attributePaths = ["author", "parentComment"])
    fun findByPostOrderByCreatedAtAscIdAsc(post: Post): List<PostComment>

    @EntityGraph(attributePaths = ["author", "parentComment"])
    fun findByPostAndId(
        post: Post,
        id: Int,
    ): PostComment?

    @EntityGraph(attributePaths = ["author"])
    override fun findById(id: Int): Optional<PostComment>

    fun deleteByPost(post: Post)
}
