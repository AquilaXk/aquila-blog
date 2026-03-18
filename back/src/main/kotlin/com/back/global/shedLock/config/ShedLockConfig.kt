package com.back.global.shedLock.config

import net.javacrumbs.shedlock.core.LockProvider
import net.javacrumbs.shedlock.provider.redis.spring.RedisLockProvider
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.data.redis.connection.RedisConnectionFactory

/**
 * ShedLockConfig는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */

@Configuration
@EnableSchedulerLock(defaultLockAtMostFor = "PT2H")
class ShedLockConfig {
    @Bean
    fun lockProvider(redisConnectionFactory: RedisConnectionFactory): LockProvider = RedisLockProvider(redisConnectionFactory)
}
