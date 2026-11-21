package com.back.boundedContexts.post.adapter.scheduler

import com.back.boundedContexts.post.application.service.PostWriteRequestIdempotencyRetentionService
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

/**
 * PostWriteRequestIdempotencyCleanupScheduledJob의 책임을 정의하는 클래스입니다.
 * 해당 도메인 흐름에서 역할 분리를 위해 분리된 구성요소입니다.
 */
@Component
@ConditionalOnProperty(
    prefix = "custom.runtime",
    name = ["worker-enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class PostWriteRequestIdempotencyCleanupScheduledJob(
    private val retentionService: PostWriteRequestIdempotencyRetentionService,
    @param:Value("\${custom.post.idempotency.cleanup.batchSize:200}")
    private val batchSize: Int,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${custom.post.idempotency.cleanup.fixedDelayMs:3600000}")
    @SchedulerLock(name = "postWriteRequestIdempotencyCleanup", lockAtLeastFor = "PT1M")
    fun cleanup() {
        val purgedCount = retentionService.purgeExpired(batchSize)
        if (purgedCount > 0) {
            log.info("Purged {} expired post write idempotency records", purgedCount)
        }
    }
}
