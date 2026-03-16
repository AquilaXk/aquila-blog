package com.back.boundedContexts.member.subContexts.notification.application.service

import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationDto
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.data.redis.connection.Message
import org.springframework.data.redis.connection.MessageListener
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper
import java.nio.charset.StandardCharsets

@Service
class MemberNotificationRealtimeRelayService(
    private val memberNotificationSseService: MemberNotificationSseService,
    private val objectMapper: ObjectMapper,
    private val redisTemplateProvider: ObjectProvider<StringRedisTemplate>,
    @param:Value("\${custom.member.notification.realtime.nodeId:\${random.uuid}}")
    private val nodeId: String,
) : MessageListener {
    data class Payload(
        val originNodeId: String,
        val memberId: Int,
        val notification: MemberNotificationDto,
        val unreadCount: Int,
    )

    fun publish(
        memberId: Int,
        notification: MemberNotificationDto,
        unreadCount: Int,
    ) {
        // 동일 노드 연결에는 즉시 전달하고, 다중 노드 연결은 Redis pub/sub로 fan-out한다.
        memberNotificationSseService.publish(
            memberId = memberId,
            notification = notification,
            unreadCount = unreadCount,
        )

        val redisTemplate = redisTemplateProvider.getIfAvailable() ?: return
        val payload =
            Payload(
                originNodeId = nodeId,
                memberId = memberId,
                notification = notification,
                unreadCount = unreadCount,
            )
        val payloadJson =
            runCatching { objectMapper.writeValueAsString(payload) }
                .getOrElse { exception ->
                    log.warn("Failed to serialize notification relay payload", exception)
                    return
                }

        runCatching {
            redisTemplate.convertAndSend(
                MEMBER_NOTIFICATION_RELAY_CHANNEL,
                payloadJson,
            )
        }.onFailure { exception ->
            log.warn("Failed to publish notification relay payload to redis", exception)
        }
    }

    override fun onMessage(
        message: Message,
        pattern: ByteArray?,
    ) {
        val payloadJson = message.body.toString(StandardCharsets.UTF_8)
        val payload =
            runCatching { objectMapper.readValue(payloadJson, Payload::class.java) }
                .getOrElse { exception ->
                    log.warn("Failed to deserialize notification relay payload", exception)
                    return
                }

        if (payload.originNodeId == nodeId) {
            return
        }

        memberNotificationSseService.publish(
            memberId = payload.memberId,
            notification = payload.notification,
            unreadCount = payload.unreadCount,
        )
    }

    companion object {
        const val MEMBER_NOTIFICATION_RELAY_CHANNEL = "member:notification:relay"
        private val log = LoggerFactory.getLogger(MemberNotificationRealtimeRelayService::class.java)
    }
}
