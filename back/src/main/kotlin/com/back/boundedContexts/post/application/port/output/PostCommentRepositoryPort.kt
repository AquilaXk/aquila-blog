package com.back.boundedContexts.post.application.port.output

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import java.util.Optional

/**
 * `PostCommentRepositoryPort` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface PostCommentRepositoryPort {
    fun save(comment: PostComment): PostComment

    fun findByPostOrderByCreatedAtAscIdAsc(post: Post): List<PostComment>

    fun findByPostOrderByCreatedAtAscIdAsc(
        post: Post,
        limit: Int,
    ): List<PostComment>

    fun findActiveSubtreeByPostAndRootCommentId(
        post: Post,
        rootCommentId: Long,
    ): List<PostComment>

    fun findByPostAndId(
        post: Post,
        id: Long,
    ): PostComment?

    fun findById(id: Long): Optional<PostComment>
}
