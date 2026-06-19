package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.application.port.output.PostCommentRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.dto.PostCommentDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.event.PostCommentDeletedEvent
import com.back.boundedContexts.post.event.PostCommentModifiedEvent
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class PostCommentApplicationService(
    private val postRepository: PostRepositoryPort,
    private val postCommentRepository: PostCommentRepositoryPort,
    private val postHydrationService: PostHydrationService,
    private val postCounterService: PostCounterService,
    private val postInteractionSideEffectQueue: PostInteractionSideEffectQueue,
) {
    @Transactional
    fun writeComment(
        author: Member,
        post: Post,
        content: String,
        parentComment: PostComment? = null,
    ): PostComment {
        val persistenceAuthor = author.toPersistenceMember()
        val persistedParentComment = parentComment?.let { findCommentById(post, it.id) ?: it }
        val comment =
            postCommentRepository.save(
                post.newComment(
                    author = persistenceAuthor,
                    content = content,
                    parentComment = persistedParentComment,
                ),
            )
        postCounterService.incrementCommentsCount(post)
        postCounterService.incrementMemberPostCommentsCount(persistenceAuthor)
        postInteractionSideEffectQueue.enqueue(
            postId = post.id,
            recommendationAction = PostInteractionRecommendationSideEffect.REFRESH,
            domainEvent =
                PostCommentWrittenEvent(
                    UUID.randomUUID(),
                    PostCommentDto(comment),
                    PostDto(post),
                    MemberDto(author),
                    persistedParentComment?.author?.id,
                ),
        )

        return comment
    }

    @Transactional
    fun modifyComment(
        postComment: PostComment,
        actor: Member,
        content: String,
    ) {
        postComment.modify(content)

        postInteractionSideEffectQueue.enqueue(
            postId = postComment.post.id,
            domainEvent =
                PostCommentModifiedEvent(
                    UUID.randomUUID(),
                    PostCommentDto(postComment),
                    PostDto(postComment.post),
                    MemberDto(actor),
                ),
        )
    }

    @Transactional
    fun deleteComment(
        post: Post,
        postComment: PostComment,
        actor: Member,
    ) {
        postHydrationService.hydratePostAttrs(post)
        val commentsToDelete =
            postCommentRepository
                .findActiveSubtreeByPostAndRootCommentId(post, postComment.id)
                .ifEmpty { listOf(postComment) }

        commentsToDelete.forEach { postHydrationService.hydrateMemberCounterAttrs(it.author) }

        val postDto = PostDto(post)
        commentsToDelete.forEachIndexed { index, comment ->
            val postCommentDto = PostCommentDto(comment)
            comment.author.decrementPostCommentsCount()
            postCounterService.saveMemberAttr(comment.author.postCommentsCountAttr)
            post.onCommentDeleted()
            comment.softDelete()

            postInteractionSideEffectQueue.enqueue(
                postId = comment.post.id,
                recommendationAction =
                    if (index == commentsToDelete.lastIndex) {
                        PostInteractionRecommendationSideEffect.REFRESH
                    } else {
                        PostInteractionRecommendationSideEffect.NONE
                    },
                domainEvent = PostCommentDeletedEvent(UUID.randomUUID(), postCommentDto, postDto, MemberDto(actor)),
            )
        }

        postCounterService.savePostAttr(post.commentsCountAttr)
        postRepository.flush()
    }

    fun getComments(
        post: Post,
        limit: Int,
    ): List<PostComment> =
        postCommentRepository.findByPostOrderByCreatedAtAscIdAsc(post, limit.coerceIn(1, 500)).also { comments ->
            postHydrationService.hydrateMembersProfileImgAttrs(comments.map { it.author })
        }

    fun findCommentById(
        post: Post,
        id: Long,
    ): PostComment? = postCommentRepository.findByPostAndId(post, id)
}
