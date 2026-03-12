package com.back.global.storage.app

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties("custom.storage.retention")
data class UploadedFileRetentionProperties(
    val tempUploadSeconds: Long = 86_400,
    val replacedProfileImageSeconds: Long = 259_200,
    val deletedPostAttachmentSeconds: Long = 1_209_600,
    val cleanupFixedDelayMs: Long = 3_600_000,
    val cleanupBatchSize: Int = 100,
)
