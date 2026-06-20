package com.back.global.redisCache.config

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties("custom.cache")
data class RedisCacheProperties(
    val ttlSeconds: Long = 3600,
    val ttlOverrides: Map<String, Long> = emptyMap(),
)
