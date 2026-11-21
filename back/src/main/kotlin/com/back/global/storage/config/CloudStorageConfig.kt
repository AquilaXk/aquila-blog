package com.back.global.storage.config

import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

@Configuration
@EnableConfigurationProperties(CloudStorageProperties::class)
class CloudStorageConfig
