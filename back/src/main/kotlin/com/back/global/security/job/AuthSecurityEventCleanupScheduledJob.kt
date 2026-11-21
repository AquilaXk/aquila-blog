package com.back.global.security.job

import com.back.global.security.application.AuthSecurityEventService
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
class AuthSecurityEventCleanupScheduledJob(
    private val authSecurityEventService: AuthSecurityEventService,
    @param:Value("\${custom.auth.securityEvent.cleanup.batchSize:500}")
    private val batchSize: Int,
    @param:Value("\${custom.auth.securityEvent.cleanup.maxBatches:20}")
    private val maxBatches: Int,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${custom.auth.securityEvent.cleanup.fixedDelayMs:3600000}")
    @SchedulerLock(name = "authSecurityEventCleanup", lockAtLeastFor = "PT1M")
    fun cleanup() {
        val normalizedBatchSize = batchSize.coerceIn(1, 1_000)
        val normalizedMaxBatches = maxBatches.coerceIn(1, 100)
        var totalPurged = 0
        var completedBatches = 0

        while (completedBatches < normalizedMaxBatches) {
            val purgedCount = authSecurityEventService.purgeExpired(normalizedBatchSize)
            if (purgedCount <= 0) break
            totalPurged += purgedCount
            completedBatches += 1
            if (purgedCount < normalizedBatchSize) break
        }

        if (totalPurged > 0) {
            log.info("Purged {} expired auth security events", totalPurged)
        }
    }
}
