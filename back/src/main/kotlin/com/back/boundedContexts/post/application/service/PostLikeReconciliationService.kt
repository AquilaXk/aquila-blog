package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Service
class PostLikeReconciliationService(
    private val postAttrRepository: PostAttrRepositoryPort,
    private val postLikeRepository: PostLikeRepositoryPort,
    private val postRepository: PostRepositoryPort,
    private val postHitSideEffectQueue: PostHitSideEffectQueue,
) {
    private val logger = LoggerFactory.getLogger(PostLikeReconciliationService::class.java)

    @Transactional
    fun reconcileRecentlyTouchedPosts(
        lookbackHours: Long,
        limit: Int,
    ): Int {
        val safeLookbackHours = lookbackHours.coerceIn(1, 24 * 30)
        val safeLimit = limit.coerceIn(1, 500)
        val modifiedAfter = Instant.now().minusSeconds(safeLookbackHours * 3600)
        val likeAttrs =
            postAttrRepository.findRecentlyModifiedByName(
                name = LIKES_COUNT,
                modifiedAfter = modifiedAfter,
                limit = safeLimit,
            )

        var correctedCount = 0

        likeAttrs.forEach { likeAttr ->
            val post = likeAttr.subject
            val actualLikesCount = postLikeRepository.countByPost(post).toInt().coerceAtLeast(0)
            val currentLikesCount = (likeAttr.intValue ?: 0).coerceAtLeast(0)
            val targetLikesCount = maxOf(currentLikesCount, actualLikesCount)
            if (likeAttr.intValue != targetLikesCount || post.likesCount != targetLikesCount) {
                logger.warn(
                    "Reconciling likes count for post {} from attr={} post={} to {}",
                    post.id,
                    likeAttr.intValue,
                    post.likesCount,
                    targetLikesCount,
                )
                likeAttr.intValue = targetLikesCount
                post.likesCount = targetLikesCount
                post.likesCountAttr = likeAttr
                postAttrRepository.save(likeAttr)
                postRepository.updateLikesCount(post, targetLikesCount, likeAttr)
                postHitSideEffectQueue.enqueue(post.id, "like")
                correctedCount++
            }
        }

        return correctedCount
    }
}
