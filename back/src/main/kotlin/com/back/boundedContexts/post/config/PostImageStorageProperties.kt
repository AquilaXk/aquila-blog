package com.back.boundedContexts.post.config

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties("custom.storage")
data class PostImageStorageProperties(
    var enabled: Boolean = false,
    var endpoint: String = "http://localhost:9000",
    var region: String = "us-east-1",
    var bucket: String = "blog-images",
    var accessKey: String = "",
    var secretKey: String = "",
    var pathStyleAccess: Boolean = true,
    var keyPrefix: String = "posts",
    var maxFileSizeBytes: Long = 10 * 1024 * 1024,
)
