package com.back.boundedContexts.post.config

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * `PostImageStorageProperties` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
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
