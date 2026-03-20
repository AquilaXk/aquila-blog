package com.back.boundedContexts.member.subContexts.notification.application.service

import com.back.boundedContexts.member.subContexts.notification.application.port.output.MemberNotificationRepositoryPort
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationDto
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationStreamPayload
import jakarta.annotation.PreDestroy
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * MemberNotificationSseService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class MemberNotificationSseService(
    private val memberNotificationRepository: MemberNotificationRepositoryPort,
    @param:Value("\${custom.member.notification.sse.maxEmittersPerMember:3}")
    private val maxEmittersPerMember: Int,
    @param:Value("\${custom.member.notification.sse.maxGlobalEmitters:2000}")
    private val maxGlobalEmitters: Int,
    @param:Value("\${custom.member.notification.sse.heartbeatSeconds:20}")
    private val heartbeatSeconds: Long,
    @param:Value("\${custom.member.notification.sse.replayProbeSeconds:60}")
    private val replayProbeSeconds: Long,
    @param:Value("\${custom.member.notification.sse.replayBatchSize:50}")
    private val replayBatchSize: Int,
) {
    private val logger = LoggerFactory.getLogger(MemberNotificationSseService::class.java)

    companion object {
        private const val DEFAULT_RETRY_MILLIS = 5_000L
        private const val MAX_REPLAY_NOTIFICATIONS = 100
    }

    private val emittersByMemberId = ConcurrentHashMap<Long, MutableSet<SseEmitter>>()
    private val heartbeatTasks = ConcurrentHashMap<SseEmitter, ScheduledFuture<*>>()
    private val emitterOwners = ConcurrentHashMap<SseEmitter, Long>()
    private val emitterConnectedAtEpochMillis = ConcurrentHashMap<SseEmitter, Long>()
    private val emitterLastNotificationId = ConcurrentHashMap<SseEmitter, Long>()
    private val emitterLastReplayEpochMillis = ConcurrentHashMap<SseEmitter, Long>()
    private val heartbeatScheduler =
        Executors.newSingleThreadScheduledExecutor { runnable ->
            Thread(runnable, "member-notification-sse-heartbeat").apply {
                isDaemon = true
            }
        }

    /**
     * subscribe 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    fun subscribe(
        memberId: Long,
        lastEventIdRaw: String?,
    ): SseEmitter {
        val emitter = SseEmitter(0L)
        val emitters = emittersByMemberId.computeIfAbsent(memberId) { ConcurrentHashMap.newKeySet() }
        emitters.add(emitter)
        emitterOwners[emitter] = memberId
        emitterConnectedAtEpochMillis[emitter] = Instant.now().toEpochMilli()
        enforceMemberEmitterLimit(memberId, emitters)
        enforceGlobalEmitterLimit()

        emitter.onCompletion { remove(memberId, emitter) }
        emitter.onTimeout { remove(memberId, emitter) }
        emitter.onError { remove(memberId, emitter) }

        val replayFrom = parseLastNotificationId(lastEventIdRaw) ?: 0L
        val replayedLastId =
            replayMissedNotificationEvents(
                memberId = memberId,
                emitter = emitter,
                lastNotificationId = replayFrom,
            )
        emitterLastNotificationId[emitter] = maxOf(replayFrom, replayedLastId)
        emitterLastReplayEpochMillis[emitter] = Instant.now().toEpochMilli()

        sendConnectedEvent(emitter)
        registerHeartbeat(memberId, emitter)

        return emitter
    }

    /**
     * 이벤트/메시지를 전파하고 실패를 안전하게 처리합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    fun publish(
        memberId: Long,
        notification: MemberNotificationDto,
        unreadCount: Int,
    ) {
        val payload = MemberNotificationStreamPayload(notification, unreadCount)
        emittersByMemberId[memberId]
            ?.toList()
            ?.forEach { emitter ->
                send(
                    emitter = emitter,
                    memberId = memberId,
                    eventId = notificationEventId(notification.id),
                    eventName = "notification",
                    data = payload,
                )
                emitterLastNotificationId[emitter] = notification.id
            }
    }

    private fun sendConnectedEvent(emitter: SseEmitter) {
        val connectedAt = Instant.now()
        send(
            emitter = emitter,
            memberId = null,
            eventId = "connected-${connectedAt.toEpochMilli()}",
            eventName = "connected",
            data = mapOf("connectedAt" to connectedAt.toString()),
        )
    }

    /**
     * 이벤트/메시지를 전파하고 실패를 안전하게 처리합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun send(
        emitter: SseEmitter,
        memberId: Long?,
        eventId: String,
        eventName: String,
        data: Any,
    ): Boolean {
        try {
            emitter.send(
                SseEmitter
                    .event()
                    .id(eventId)
                    .name(eventName)
                    .reconnectTime(DEFAULT_RETRY_MILLIS)
                    .data(data, MediaType.APPLICATION_JSON),
            )
            return true
        } catch (_: Exception) {
            memberId?.let { remove(it, emitter) }
            return false
        }
    }

    private fun sendHeartbeat(
        memberId: Long,
        emitter: SseEmitter,
    ) {
        val heartbeatAt = Instant.now()
        send(
            emitter = emitter,
            memberId = memberId,
            eventId = "heartbeat-${heartbeatAt.toEpochMilli()}",
            eventName = "heartbeat",
            data = mapOf("heartbeatAt" to heartbeatAt.toString()),
        )
    }

    /**
     * registerHeartbeat 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun registerHeartbeat(
        memberId: Long,
        emitter: SseEmitter,
    ) {
        val fixedDelaySeconds = heartbeatSeconds.coerceAtLeast(3)
        val task =
            heartbeatScheduler.scheduleAtFixedRate(
                {
                    sendHeartbeat(memberId, emitter)
                    if (shouldProbeReplay(emitter)) {
                        replayMissedNotificationEvents(
                            memberId = memberId,
                            emitter = emitter,
                            lastNotificationId = emitterLastNotificationId[emitter] ?: 0L,
                        )
                    }
                },
                fixedDelaySeconds,
                fixedDelaySeconds,
                TimeUnit.SECONDS,
            )

        heartbeatTasks[emitter] = task
    }

    private fun remove(
        memberId: Long,
        emitter: SseEmitter,
    ) {
        heartbeatTasks.remove(emitter)?.cancel(true)
        emitterOwners.remove(emitter)
        emitterConnectedAtEpochMillis.remove(emitter)
        emitterLastNotificationId.remove(emitter)
        emitterLastReplayEpochMillis.remove(emitter)
        emittersByMemberId[memberId]?.remove(emitter)
        if (emittersByMemberId[memberId].isNullOrEmpty()) {
            emittersByMemberId.remove(memberId)
        }
    }

    private fun shouldProbeReplay(emitter: SseEmitter): Boolean {
        val now = Instant.now().toEpochMilli()
        val replayIntervalMillis = replayProbeSeconds.coerceAtLeast(heartbeatSeconds).coerceAtLeast(3) * 1_000
        val lastReplayAt = emitterLastReplayEpochMillis[emitter] ?: 0L
        if (now - lastReplayAt < replayIntervalMillis) return false
        emitterLastReplayEpochMillis[emitter] = now
        return true
    }

    /**
     * enforceMemberEmitterLimit 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun enforceMemberEmitterLimit(
        memberId: Long,
        emitters: MutableSet<SseEmitter>,
    ) {
        val safeLimit = maxEmittersPerMember.coerceAtLeast(1)
        while (emitters.size > safeLimit) {
            val oldestEmitter = emitters.minByOrNull { emitterConnectedAtEpochMillis[it] ?: Long.MAX_VALUE } ?: return
            remove(memberId, oldestEmitter)
            runCatching { oldestEmitter.complete() }
        }
    }

    /**
     * enforceGlobalEmitterLimit 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun enforceGlobalEmitterLimit() {
        val safeGlobalLimit = maxGlobalEmitters.coerceAtLeast(100)
        while (emitterConnectedAtEpochMillis.size > safeGlobalLimit) {
            val oldestEmitter =
                emitterConnectedAtEpochMillis.entries
                    .minByOrNull { it.value }
                    ?.key
                    ?: return
            val ownerId = emitterOwners[oldestEmitter]
            if (ownerId == null) {
                emitterConnectedAtEpochMillis.remove(oldestEmitter)
                continue
            }
            remove(ownerId, oldestEmitter)
            runCatching { oldestEmitter.complete() }
        }
    }

    /**
     * replayMissedNotificationEvents 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun replayMissedNotificationEvents(
        memberId: Long,
        emitter: SseEmitter,
        lastNotificationId: Long,
    ): Long {
        val safeLimit = replayBatchSize.coerceIn(1, MAX_REPLAY_NOTIFICATIONS)
        val notifications =
            memberNotificationRepository.findByReceiverIdAndIdGreaterThan(
                receiverId = memberId,
                lastNotificationId = lastNotificationId,
                limit = safeLimit,
            )
        if (notifications.isEmpty()) return lastNotificationId
        val unreadCount =
            runCatching { memberNotificationRepository.countUnreadByReceiverId(memberId).toInt() }
                .onFailure { exception ->
                    logger.warn(
                        "notification_replay_unread_count_fallback memberId={} reason={}",
                        memberId,
                        exception::class.java.simpleName,
                        exception,
                    )
                }.getOrDefault(0)

        var latestId = lastNotificationId
        notifications.forEach { notification ->
            val dto =
                runCatching { MemberNotificationDto(notification) }
                    .onFailure { exception ->
                        logger.warn(
                            "notification_replay_item_skip memberId={} notificationId={} reason={}",
                            memberId,
                            notification.id,
                            exception::class.java.simpleName,
                            exception,
                        )
                    }.getOrNull()
            if (dto == null) {
                latestId = notification.id
                emitterLastNotificationId[emitter] = latestId
                return@forEach
            }
            val payload = MemberNotificationStreamPayload(dto, unreadCount)
            val sent =
                send(
                    emitter = emitter,
                    memberId = memberId,
                    eventId = notificationEventId(notification.id),
                    eventName = "notification",
                    data = payload,
                )
            if (!sent) {
                return latestId
            }
            latestId = notification.id
            emitterLastNotificationId[emitter] = latestId
        }
        return latestId
    }

    /**
     * 원본 입력에서 필요한 값을 안전하게 추출합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun parseLastNotificationId(lastEventIdRaw: String?): Long? {
        val raw = lastEventIdRaw?.trim().orEmpty()
        if (raw.isBlank()) return null
        if (raw.startsWith("notification-")) return raw.removePrefix("notification-").toLongOrNull()
        return raw.toLongOrNull()
    }

    private fun notificationEventId(notificationId: Long): String = "notification-$notificationId"

    @PreDestroy
    fun shutdownHeartbeatScheduler() {
        heartbeatScheduler.shutdownNow()
    }
}
