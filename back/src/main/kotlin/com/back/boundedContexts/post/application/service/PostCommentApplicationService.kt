package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.application.port.output.PostCommentAccountDeletionTarget
import com.back.boundedContexts.post.application.port.output.PostCommentRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.dto.PostCommentDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.event.PostCommentDeletedEvent
import com.back.boundedContexts.post.event.PostCommentModifiedEvent
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import com.back.global.exception.application.AppException
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
        val persistedParentComment =
            parentComment?.let {
                findCommentById(post, it.id)
                    ?: throw AppException("404-1", "부모 댓글을 찾을 수 없습니다.")
            }
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
        publishDomainEvent: Boolean = true,
    ) {
        postHydrationService.hydratePostAttrs(post)
        val commentsToDelete =
            postCommentRepository
                .findActiveSubtreeByPostAndRootCommentId(post, postComment.id)

        commentsToDelete.forEach { postHydrationService.hydrateMemberCounterAttrs(it.author) }

        commentsToDelete.forEachIndexed { index, comment ->
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
                domainEvent =
                    if (publishDomainEvent) {
                        PostCommentDeletedEvent(
                            UUID.randomUUID(),
                            PostCommentDto(comment),
                            PostDto(post),
                            MemberDto(actor),
                        )
                    } else {
                        null
                    },
            )
        }

        postCounterService.savePostAttr(post.commentsCountAttr)
        postRepository.flush()
    }

    @Transactional
    fun deleteCommentsByAuthorForAccountDeletion(author: Member): Int {
        val rootTargets =
            findAccountDeletionRootCommentTargets(
                postCommentRepository.findActiveAccountDeletionTargetsByAuthorId(author.id),
            )

        rootTargets.forEach { target ->
            if (target.postDeleted) {
                deleteDeletedPostCommentSubtreeForAccountDeletion(target.postId, target.comment)
            } else {
                deleteComment(target.comment.post, target.comment, author, publishDomainEvent = false)
            }
        }

        return rootTargets.size
    }

    private fun findAccountDeletionRootCommentTargets(
        targets: List<PostCommentAccountDeletionTarget>,
    ): List<PostCommentAccountDeletionTarget> {
        val authoredCommentIds = targets.mapTo(mutableSetOf()) { it.comment.id }

        return targets.filterNot { target ->
            hasAuthoredAncestor(target.comment, authoredCommentIds)
        }
    }

    private fun hasAuthoredAncestor(
        comment: PostComment,
        authoredCommentIds: Set<Long>,
    ): Boolean {
        var parentComment = comment.parentComment
        while (parentComment != null) {
            if (parentComment.id in authoredCommentIds) return true
            parentComment = parentComment.parentComment
        }
        return false
    }

    private fun deleteDeletedPostCommentSubtreeForAccountDeletion(
        postId: Long,
        postComment: PostComment,
    ) {
        val commentsToDelete =
            postCommentRepository
                .findActiveSubtreeByPostIdAndRootCommentId(postId, postComment.id)

        commentsToDelete.forEach { postHydrationService.hydrateMemberCounterAttrs(it.author) }

        commentsToDelete.forEachIndexed { index, comment ->
            comment.author.decrementPostCommentsCount()
            postCounterService.saveMemberAttr(comment.author.postCommentsCountAttr)
            comment.softDelete()
            postInteractionSideEffectQueue.enqueue(
                postId = postId,
                recommendationAction =
                    if (index == commentsToDelete.lastIndex) {
                        PostInteractionRecommendationSideEffect.REFRESH
                    } else {
                        PostInteractionRecommendationSideEffect.NONE
                    },
                domainEvent = null,
            )
        }

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
