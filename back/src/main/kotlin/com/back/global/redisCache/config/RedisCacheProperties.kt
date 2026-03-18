package com.back.global.redisCache.config

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * RedisCacheProperties는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */
@ConfigurationProperties("custom.cache")
data class RedisCacheProperties(
    val ttlSeconds: Long = 3600,
    val ttlOverrides: Map<String, Long> = emptyMap(),
)
