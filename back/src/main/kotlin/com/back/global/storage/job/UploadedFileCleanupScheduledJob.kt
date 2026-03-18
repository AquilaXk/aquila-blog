package com.back.global.storage.job

import com.back.global.storage.application.UploadedFileRetentionProperties
import com.back.global.storage.application.UploadedFileRetentionService
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

/**
 * UploadedFileCleanupScheduledJob는 글로벌 공통 정책을 담당하는 구성요소입니다.
 * 모듈 간 중복을 줄이고 공통 규칙을 일관되게 적용하기 위해 분리되었습니다.
 */
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
