package com.back.boundedContexts.post.adapter.scheduler

import com.back.boundedContexts.post.application.service.PostLikeReconciliationService
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

/**
 * PostLikeReconciliationScheduledJob의 책임을 정의하는 클래스입니다.
 * 해당 도메인 흐름에서 역할 분리를 위해 분리된 구성요소입니다.
 */
@Component
@ConditionalOnProperty(
    prefix = "custom.runtime",
    name = ["worker-enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class PostLikeReconciliationScheduledJob(
    private val postLikeReconciliationService: PostLikeReconciliationService,
    @param:Value("\${custom.post.likes.reconciliation.lookbackHours:24}")
    private val lookbackHours: Long,
    @param:Value("\${custom.post.likes.reconciliation.batchSize:100}")
    private val batchSize: Int,
) {
    private val logger = LoggerFactory.getLogger(PostLikeReconciliationScheduledJob::class.java)

    /**
     * 주기 실행에서 데이터 정합성 보정 작업을 수행합니다.
     * 스케줄러 계층에서 주기 실행 중 실패가 전체 잡 중단으로 번지지 않도록 설계합니다.
     */
    @Scheduled(fixedDelayString = "\${custom.post.likes.reconciliation.fixedDelayMs:900000}")
    @SchedulerLock(name = "reconcilePostLikeCounts", lockAtLeastFor = "PT1M")
    fun reconcile() {
        val correctedCount =
            postLikeReconciliationService.reconcileRecentlyTouchedPosts(
                lookbackHours = lookbackHours,
                limit = batchSize,
            )

        if (correctedCount > 0) {
            logger.warn("Reconciled likes count for {} posts", correctedCount)
        }
    }
}
