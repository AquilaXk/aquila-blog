package com.back.boundedContexts.member.subContexts.session.job

import com.back.boundedContexts.member.subContexts.session.application.service.MemberSessionService
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Instant

/**
 * 참조 구현: TryGhost/Ghost (MIT) — Iterative batch backlog cleanup with safety bound
 */
@Component
@ConditionalOnProperty(
    prefix = "custom.runtime",
    name = ["worker-enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class MemberSessionCleanupScheduledJob(
    private val memberSessionService: MemberSessionService,
    @param:Value("\${custom.auth.session.cleanup.batchSize:500}")
    private val batchSize: Int,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    companion object {
        private const val MAX_CLEANUP_ITERATIONS = 10
    }

    @Scheduled(fixedDelayString = "\${custom.auth.session.cleanup.fixedDelayMs:3600000}")
    @SchedulerLock(name = "memberSessionCleanup", lockAtLeastFor = "PT1M")
    fun cleanup() {
        cleanup(Instant.now())
    }

    fun cleanup(now: Instant) {
        var totalPurged = 0
        var iterations = 0
        while (iterations < MAX_CLEANUP_ITERATIONS) {
            val purgedCount = memberSessionService.purgeExpiredRevokedSessions(batchSize, now)
            totalPurged += purgedCount
            iterations++
            if (purgedCount < batchSize) break
        }
        if (totalPurged > 0) {
            log.info("Purged {} expired revoked member sessions across {} iterations", totalPurged, iterations)
        }
    }
}
