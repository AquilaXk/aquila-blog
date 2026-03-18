package com.back.global.storage.application

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * UploadedFileRetentionProperties는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */
@ConfigurationProperties("custom.storage.retention")
data class UploadedFileRetentionProperties(
    val tempUploadSeconds: Long = 86_400,
    val replacedProfileImageSeconds: Long = 259_200,
    val deletedPostAttachmentSeconds: Long = 1_209_600,
    val cleanupFixedDelayMs: Long = 3_600_000,
    val cleanupBatchSize: Int = 100,
    val cleanupSafetyThreshold: Int = 25,
)
