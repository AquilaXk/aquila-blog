package com.back.boundedContexts.member.subContexts.notification.config

import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationRealtimeRelayService
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.data.redis.connection.RedisConnectionFactory
import org.springframework.data.redis.listener.ChannelTopic
import org.springframework.data.redis.listener.RedisMessageListenerContainer

/**
 * MemberNotificationRealtimeRelayRedisConfig는 해당 도메인의 설정 구성을 담당합니다.
 * 보안 정책, 빈 등록, 프로퍼티 매핑 등 실행 구성을 명시합니다.
 */
@Configuration
class MemberNotificationRealtimeRelayRedisConfig {
    @Bean
    @ConditionalOnBean(RedisConnectionFactory::class)
    @ConditionalOnProperty(
        name = ["custom.member.notification.realtime.enabled"],
        havingValue = "true",
        matchIfMissing = true,
    )
    fun memberNotificationRelayRedisMessageListenerContainer(
        connectionFactory: RedisConnectionFactory,
        memberNotificationRealtimeRelayService: MemberNotificationRealtimeRelayService,
    ): RedisMessageListenerContainer =
        RedisMessageListenerContainer().apply {
            setConnectionFactory(connectionFactory)
            addMessageListener(
                memberNotificationRealtimeRelayService,
                ChannelTopic(MemberNotificationRealtimeRelayService.MEMBER_NOTIFICATION_RELAY_CHANNEL),
            )
        }
}
