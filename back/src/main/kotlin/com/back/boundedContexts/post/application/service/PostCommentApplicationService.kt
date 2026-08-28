package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostCommentAccountDeletionTarget
import com.back.boundedContexts.post.application.port.output.PostCommentRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class PostCommentApplicationService(
    private val postRepository: PostRepositoryPort,
    private val postCommentRepository: PostCommentRepositoryPort,
    private val postHydrationService: PostHydrationService,
    private val postCounterService: PostCounterService,
) {
    @Transactional
    fun deleteCommentsByAuthorForAccountDeletion(author: Member): Set<Long> {
        val rootTargets =
            findAccountDeletionRootCommentTargets(
                postCommentRepository.findActiveAccountDeletionTargetsByAuthorId(author.id),
            )

        val recommendationRefreshPostIds = linkedSetOf<Long>()

        rootTargets.forEach { target ->
            if (target.postDeleted) {
                deleteDeletedPostCommentSubtreeForAccountDeletion(target.postId, target.comment)
            } else {
                deleteActivePostCommentSubtreeForAccountDeletion(target.comment.post, target.comment)
                if (target.comment.post.published && target.comment.post.listed) {
                    recommendationRefreshPostIds += target.postId
                }
            }
        }

        return recommendationRefreshPostIds
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

    private fun deleteActivePostCommentSubtreeForAccountDeletion(
        post: Post,
        postComment: PostComment,
    ) {
        postHydrationService.hydratePostAttrs(post)
        val commentsToDelete =
            postCommentRepository
                .findActiveSubtreeByPostAndRootCommentId(post, postComment.id)

        commentsToDelete.forEach { postHydrationService.hydrateMemberCounterAttrs(it.author) }
        commentsToDelete.forEach { comment ->
            comment.author.decrementPostCommentsCount()
            postCounterService.saveMemberAttr(comment.author.postCommentsCountAttr)
            post.onCommentDeleted()
            comment.softDelete()
        }

        postCounterService.savePostAttr(post.commentsCountAttr)
        postRepository.flush()
    }

    private fun deleteDeletedPostCommentSubtreeForAccountDeletion(
        postId: Long,
        postComment: PostComment,
    ) {
        val commentsToDelete =
            postCommentRepository
                .findActiveSubtreeByPostIdAndRootCommentId(postId, postComment.id)

        commentsToDelete.forEach { postHydrationService.hydrateMemberCounterAttrs(it.author) }
        commentsToDelete.forEach { comment ->
            comment.author.decrementPostCommentsCount()
            postCounterService.saveMemberAttr(comment.author.postCommentsCountAttr)
            comment.softDelete()
        }

        postCommentRepository.decrementPostCommentsCountByPostId(postId, commentsToDelete.size)
        postRepository.flush()
    }
}
