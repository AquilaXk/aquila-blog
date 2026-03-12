package com.back.global.storage.config

import com.back.global.storage.app.UploadedFileRetentionProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

@Configuration
@EnableConfigurationProperties(UploadedFileRetentionProperties::class)
class UploadedFileRetentionConfig
