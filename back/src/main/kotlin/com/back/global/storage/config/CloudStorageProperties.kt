package com.back.global.storage.config

import org.springframework.boot.context.properties.ConfigurationProperties

const val DEFAULT_CLOUD_DOCUMENT_MAX_SIZE_BYTES: Long = 100L * 1024 * 1024
const val DEFAULT_CLOUD_PHOTO_MAX_SIZE_BYTES: Long = 50L * 1024 * 1024
const val DEFAULT_CLOUD_ARCHIVE_MAX_SIZE_BYTES: Long = 500L * 1024 * 1024
const val DEFAULT_CLOUD_VIDEO_MAX_SIZE_BYTES: Long = 500L * 1024 * 1024
const val DEFAULT_CLOUD_VIDEO_STREAM_MAX_SIZE_BYTES: Long = 5L * 1024 * 1024 * 1024

@ConfigurationProperties("custom.storage")
data class CloudStorageProperties(
    var enabled: Boolean = false,
    var endpoint: String = "http://localhost:9000",
    var region: String = "us-east-1",
    var bucket: String = "blog-images",
    var accessKey: String = "",
    var secretKey: String = "",
    var pathStyleAccess: Boolean = true,
    var cloudKeyPrefix: String = "cloud",
    var maxFileSizeBytes: Long = DEFAULT_CLOUD_DOCUMENT_MAX_SIZE_BYTES,
    var cloudDocumentMaxFileSizeBytes: Long = maxFileSizeBytes,
    var cloudPhotoMaxFileSizeBytes: Long = DEFAULT_CLOUD_PHOTO_MAX_SIZE_BYTES,
    var cloudArchiveMaxFileSizeBytes: Long = DEFAULT_CLOUD_ARCHIVE_MAX_SIZE_BYTES,
    var cloudVideoMaxFileSizeBytes: Long = DEFAULT_CLOUD_VIDEO_MAX_SIZE_BYTES,
    var cloudVideoStreamMaxFileSizeBytes: Long = DEFAULT_CLOUD_VIDEO_STREAM_MAX_SIZE_BYTES,
)
