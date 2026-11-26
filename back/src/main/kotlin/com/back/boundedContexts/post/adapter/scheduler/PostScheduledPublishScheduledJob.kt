package com.back.boundedContexts.post.adapter.scheduler

import com.back.boundedContexts.post.application.port.input.PostScheduledPublishUseCase
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
class PostScheduledPublishScheduledJob(
    private val postScheduledPublishUseCase: PostScheduledPublishUseCase,
    @param:Value("\${custom.post.scheduledPublish.batchSize:50}")
    private val batchSize: Int,
) {
    private val logger = LoggerFactory.getLogger(PostScheduledPublishScheduledJob::class.java)

    @Scheduled(fixedDelayString = "\${custom.post.scheduledPublish.fixedDelayMs:30000}")
    @SchedulerLock(name = "publishScheduledPosts", lockAtLeastFor = "PT10S")
    fun publishDuePosts() {
        val count = postScheduledPublishUseCase.publishDueScheduledPosts(batchSize = batchSize)
        if (count > 0) {
            logger.info("Published {} scheduled posts", count)
        }
    }
}
