package com.back.boundedContexts.member.subContexts.session.job

import com.back.boundedContexts.member.subContexts.session.application.service.MemberSessionService
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Instant

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

    @Scheduled(fixedDelayString = "\${custom.auth.session.cleanup.fixedDelayMs:3600000}")
    @SchedulerLock(name = "memberSessionCleanup", lockAtLeastFor = "PT1M")
    fun cleanup() {
        cleanup(Instant.now())
    }

    fun cleanup(now: Instant) {
        val purgedCount = memberSessionService.purgeExpiredRevokedSessions(batchSize, now)
        if (purgedCount > 0) {
            log.info("Purged {} expired revoked member sessions", purgedCount)
        }
    }
}
