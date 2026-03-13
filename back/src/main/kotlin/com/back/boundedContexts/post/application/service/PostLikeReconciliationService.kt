package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.out.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.out.PostLikeRepositoryPort
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Service
class PostLikeReconciliationService(
    private val postAttrRepository: PostAttrRepositoryPort,
    private val postLikeRepository: PostLikeRepositoryPort,
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
            val actualLikesCount = postLikeRepository.countByPost(likeAttr.subject).toInt()
            if (likeAttr.intValue != actualLikesCount) {
                logger.warn(
                    "Reconciling likes count for post {} from {} to {}",
                    likeAttr.subject.id,
                    likeAttr.intValue,
                    actualLikesCount,
                )
                likeAttr.intValue = actualLikesCount
                postAttrRepository.save(likeAttr)
                correctedCount++
            }
        }

        return correctedCount
    }
}
