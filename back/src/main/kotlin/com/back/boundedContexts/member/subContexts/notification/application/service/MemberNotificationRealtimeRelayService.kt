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

/**
 * MemberNotificationRealtimeRelayService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
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
        val memberId: Long,
        val notification: MemberNotificationDto,
        val unreadCount: Int,
    )

    /**
     * 이벤트/메시지를 전파하고 실패를 안전하게 처리합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    fun publish(
        memberId: Long,
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

    /**
     * onMessage 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
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
