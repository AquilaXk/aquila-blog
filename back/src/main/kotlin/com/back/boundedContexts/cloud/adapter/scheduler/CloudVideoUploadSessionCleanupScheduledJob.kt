package com.back.boundedContexts.cloud.adapter.scheduler

import com.back.boundedContexts.cloud.application.service.CloudVideoUploadSessionService
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

/**
 * 방치된 S3 multipart upload가 외부 스토리지에 계속 남지 않도록 만료된 동영상 세션을 정리합니다.
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
    }
}
