package com.back.boundedContexts.post.config

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties("custom.storage")
data class PostImageStorageProperties(
    val enabled: Boolean = false,
    val endpoint: String = "http://localhost:9000",
    val region: String = "us-east-1",
    val bucket: String = "blog-images",
    val accessKey: String = "",
    val secretKey: String = "",
    val pathStyleAccess: Boolean = true,
    val keyPrefix: String = "posts",
    val maxFileSizeBytes: Long = 10 * 1024 * 1024,
)
