package com.back.boundedContexts.post.config

import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

@Configuration
@EnableConfigurationProperties(PostImageStorageProperties::class)
class PostImageStorageConfig
