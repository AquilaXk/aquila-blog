package com.back.boundedContexts.post.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.time.Clock

@Configuration(proxyBeanMethods = false)
class PostCursorConfiguration {
    @Bean
    fun postCursorClock(): Clock = Clock.systemUTC()
}
