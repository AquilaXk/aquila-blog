package com.back.global.storage.config

import org.springframework.boot.context.properties.ConfigurationProperties

const val DEFAULT_CLOUD_FILE_MAX_SIZE_BYTES: Long = 50L * 1024 * 1024

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
    var maxFileSizeBytes: Long = DEFAULT_CLOUD_FILE_MAX_SIZE_BYTES,
)
