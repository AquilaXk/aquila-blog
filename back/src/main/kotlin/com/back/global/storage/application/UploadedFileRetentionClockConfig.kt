package com.back.global.storage.application

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.time.Clock

@Configuration
class UploadedFileRetentionClockConfig {
    @Bean
    @ConditionalOnMissingBean(Clock::class)
    fun uploadedFileRetentionClock(): Clock = Clock.systemUTC()
}
