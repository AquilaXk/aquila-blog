package com.back.boundedContexts.member.subContexts.notification.config

import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationRealtimeRelayService
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.data.redis.connection.RedisConnectionFactory
import org.springframework.data.redis.listener.ChannelTopic
import org.springframework.data.redis.listener.RedisMessageListenerContainer

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
