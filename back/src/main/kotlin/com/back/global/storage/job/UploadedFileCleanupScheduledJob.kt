package com.back.global.storage.job

import com.back.global.storage.app.UploadedFileRetentionProperties
import com.back.global.storage.app.UploadedFileRetentionService
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
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
