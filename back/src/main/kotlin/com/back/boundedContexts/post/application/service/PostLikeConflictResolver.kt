package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.postMixin.PostLikeToggleResult
import com.back.boundedContexts.post.model.Post
import com.back.global.exception.application.AppException
import jakarta.persistence.OptimisticLockException
import org.slf4j.LoggerFactory
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.orm.ObjectOptimisticLockingFailureException
import org.springframework.stereotype.Service
import java.sql.SQLException

@Service
class PostLikeConflictResolver {
    private val logger = LoggerFactory.getLogger(PostLikeConflictResolver::class.java)

    fun resolve(
        post: Post,
        actor: Member,
        action: () -> PostLikeToggleResult,
        reconcile: () -> PostLikeToggleResult,
        snapshot: () -> PostLikeToggleResult,
    ): PostLikeToggleResult =
        try {
            action()
        } catch (exception: Exception) {
            if (!isRecoverableLikeConflict(exception)) throw exception
            recoverLikeResult(post, actor, exception, reconcile, snapshot)
        }

    private fun recoverLikeResult(
        post: Post,
        actor: Member,
        exception: Exception,
        reconcile: () -> PostLikeToggleResult,
        snapshot: () -> PostLikeToggleResult,
    ): PostLikeToggleResult {
        logger.warn("Like conflict recovered with reconcile/snapshot. postId={} actorId={}", post.id, actor.id, exception)
        return try {
            reconcile()
        } catch (reconcileException: Exception) {
            logger.warn(
                "Like reconcile failed, fallback to snapshot. postId={} actorId={}",
                post.id,
                actor.id,
                reconcileException,
            )
            snapshot()
        }
    }

    private fun isRecoverableLikeConflict(exception: Exception): Boolean {
        if (exception is ObjectOptimisticLockingFailureException) return true
        if (exception is OptimisticLockingFailureException) return true
        if (exception is OptimisticLockException) return true
        if (exception is AppException && exception.rsData.statusCode == 409) return true

        val sqlException =
            generateSequence<Throwable>(exception) { it.cause }
                .filterIsInstance<SQLException>()
                .firstOrNull()
        return sqlException?.sqlState in RECOVERABLE_SQL_STATES
    }

    private companion object {
        private val RECOVERABLE_SQL_STATES = setOf("23505", "40001", "40P01")
    }
}
