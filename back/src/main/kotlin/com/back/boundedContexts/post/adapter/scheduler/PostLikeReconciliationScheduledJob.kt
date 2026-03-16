package com.back.boundedContexts.post.adapter.scheduler

import com.back.boundedContexts.post.application.service.PostLikeReconciliationService
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

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
