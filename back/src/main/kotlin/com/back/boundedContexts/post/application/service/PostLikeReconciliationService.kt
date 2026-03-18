package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostLikeRepositoryPort
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

/**
 * PostLikeReconciliationService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class PostLikeReconciliationService(
    private val postAttrRepository: PostAttrRepositoryPort,
    private val postLikeRepository: PostLikeRepositoryPort,
) {
    private val logger = LoggerFactory.getLogger(PostLikeReconciliationService::class.java)

    /**
     * reconcileRecentlyTouchedPosts 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
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
