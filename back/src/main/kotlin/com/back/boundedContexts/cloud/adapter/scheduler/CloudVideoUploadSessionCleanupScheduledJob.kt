package com.back.boundedContexts.cloud.adapter.scheduler

import com.back.boundedContexts.cloud.application.service.CloudVideoUploadSessionService
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

/**
 * 만료된 IN_PROGRESS 세션과 중간 상태에 고착된 stale 세션을 정리합니다.
 */
@Component
@ConditionalOnProperty(
    prefix = "custom.runtime",
    name = ["worker-enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class CloudVideoUploadSessionCleanupScheduledJob(
    private val cloudVideoUploadSessionService: CloudVideoUploadSessionService,
    @param:Value("\${custom.storage.cloudVideoResumableCleanupBatchSize:100}")
    private val batchSize: Int,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${custom.storage.cloudVideoResumableCleanupFixedDelayMs:3600000}")
    @SchedulerLock(name = "cloudVideoUploadSessionCleanup", lockAtLeastFor = "PT1M")
    fun cleanupExpiredSessions() {
        val purgedCount = cloudVideoUploadSessionService.purgeExpiredSessions(batchSize)
        if (purgedCount > 0) {
            log.info("Purged {} expired cloud video upload sessions", purgedCount)
        }
        val staleRecoveredCount = cloudVideoUploadSessionService.purgeStaleIntermediateSessions(batchSize)
        if (staleRecoveredCount > 0) {
            log.info("Recovered {} stale intermediate cloud video upload sessions", staleRecoveredCount)
        }
    }
}
