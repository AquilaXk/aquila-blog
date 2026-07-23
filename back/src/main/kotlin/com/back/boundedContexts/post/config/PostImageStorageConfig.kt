package com.back.boundedContexts.post.config

import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

/**
 * PostImageStorageConfig는 해당 도메인의 설정 구성을 담당합니다.
 * 보안 정책, 빈 등록, 프로퍼티 매핑 등 실행 구성을 명시합니다.
 */
@Configuration
@EnableConfigurationProperties(PostImageStorageProperties::class)
class PostImageStorageConfig
