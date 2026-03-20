package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.application.port.output.PostCommentRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Component
import java.util.Optional

/**
 * PostCommentRepositoryAdapter는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
@Component
class PostCommentRepositoryAdapter(
    private val postCommentRepository: PostCommentRepository,
) : PostCommentRepositoryPort {
    override fun save(comment: PostComment): PostComment = postCommentRepository.save(comment)

    override fun findByPostOrderByCreatedAtAscIdAsc(post: Post): List<PostComment> =
        postCommentRepository.findByPostOrderByCreatedAtAscIdAsc(post)

    override fun findByPostOrderByCreatedAtAscIdAsc(
        post: Post,
        limit: Int,
    ): List<PostComment> = postCommentRepository.findByPostOrderByCreatedAtAscIdAsc(post, PageRequest.of(0, limit))

    override fun findActiveSubtreeByPostAndRootCommentId(
        post: Post,
        rootCommentId: Long,
    ): List<PostComment> = postCommentRepository.findActiveSubtreeByPostAndRootCommentId(post, rootCommentId)

    override fun findByPostAndId(
        post: Post,
        id: Long,
    ): PostComment? = postCommentRepository.findByPostAndId(post, id)

    override fun findById(id: Long): Optional<PostComment> = postCommentRepository.findById(id)
}
