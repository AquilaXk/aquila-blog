package com.back.boundedContexts.cloud.adapter.scheduler

import com.back.boundedContexts.cloud.application.service.CloudExternalPlaybackTokenService
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

/**
 * 만료된 외부 재생 token 행을 배치 삭제합니다.
 * 짧은 grace 이후 삭제하며, token 검증(`findValid`)은 expiresAt만 보므로 grace는 housekeeping용입니다.
 */
@Component
@ConditionalOnProperty(
    prefix = "custom.runtime",
    name = ["worker-enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class CloudExternalPlaybackTokenCleanupScheduledJob(
    private val cloudExternalPlaybackTokenService: CloudExternalPlaybackTokenService,
    @param:Value("\${custom.storage.cloudExternalPlaybackTokenCleanupBatchSize:100}")
    private val batchSize: Int,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${custom.storage.cloudExternalPlaybackTokenCleanupFixedDelayMs:3600000}")
    @SchedulerLock(name = "cloudExternalPlaybackTokenCleanup", lockAtLeastFor = "PT1M")
    fun cleanupExpiredTokens() {
        val purgedCount = cloudExternalPlaybackTokenService.purgeExpiredTokens(batchSize)
        if (purgedCount > 0) {
            log.info("Purged {} expired cloud external playback tokens", purgedCount)
        }
    }
}
