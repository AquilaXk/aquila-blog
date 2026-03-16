package com.back.global.storage.job

import com.back.global.storage.application.UploadedFileRetentionProperties
import com.back.global.storage.application.UploadedFileRetentionService
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
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
class UploadedFileCleanupScheduledJob(
    private val uploadedFileRetentionService: UploadedFileRetentionService,
    private val retentionProperties: UploadedFileRetentionProperties,
) {
    @Scheduled(fixedDelayString = "\${custom.storage.retention.cleanupFixedDelayMs:3600000}")
    @SchedulerLock(name = "purgeUploadedFiles", lockAtLeastFor = "PT1M")
    fun purgeExpiredFiles() {
        uploadedFileRetentionService.purgeExpiredFiles(retentionProperties.cleanupBatchSize)
    }
}
