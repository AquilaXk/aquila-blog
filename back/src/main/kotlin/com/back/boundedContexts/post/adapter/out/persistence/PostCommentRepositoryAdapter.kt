package com.back.boundedContexts.post.adapter.out.persistence

import com.back.boundedContexts.post.application.port.out.PostCommentRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import org.springframework.stereotype.Component
import java.util.Optional

@Component
class PostCommentRepositoryAdapter(
    private val postCommentRepository: PostCommentRepository,
) : PostCommentRepositoryPort {
    override fun save(comment: PostComment): PostComment = postCommentRepository.save(comment)

    override fun findByPostOrderByCreatedAtAscIdAsc(post: Post): List<PostComment> =
        postCommentRepository.findByPostOrderByCreatedAtAscIdAsc(post)

    override fun findActiveSubtreeByPostAndRootCommentId(
        post: Post,
        rootCommentId: Int,
    ): List<PostComment> = postCommentRepository.findActiveSubtreeByPostAndRootCommentId(post, rootCommentId)

    override fun findByPostAndId(
        post: Post,
        id: Int,
    ): PostComment? = postCommentRepository.findByPostAndId(post, id)

    override fun findById(id: Int): Optional<PostComment> = postCommentRepository.findById(id)
}
