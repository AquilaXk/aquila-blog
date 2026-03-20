package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.EntityGraph
import org.springframework.data.jpa.repository.JpaRepository
import java.util.Optional

/**
 * `PostCommentRepository` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface PostCommentRepository :
    JpaRepository<PostComment, Long>,
    PostCommentRepositoryCustom {
    /**
     * 댓글 목록 DTO 매핑 시 author / parentComment lazy-load로 인한 N+1을 피한다.
     */
    @EntityGraph(attributePaths = ["author", "parentComment"])
    fun findByPostOrderByCreatedAtAscIdAsc(post: Post): List<PostComment>

    @EntityGraph(attributePaths = ["author", "parentComment"])
    fun findByPostOrderByCreatedAtAscIdAsc(
        post: Post,
        pageable: Pageable,
    ): List<PostComment>

    @EntityGraph(attributePaths = ["author", "parentComment"])
    fun findByPostAndId(
        post: Post,
        id: Long,
    ): PostComment?

    @EntityGraph(attributePaths = ["author"])
    override fun findById(id: Long): Optional<PostComment>

    fun deleteByPost(post: Post)
}
