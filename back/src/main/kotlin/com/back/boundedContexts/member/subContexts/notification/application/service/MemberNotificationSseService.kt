package com.back.boundedContexts.member.subContexts.notification.application.service

import com.back.boundedContexts.member.subContexts.notification.application.port.output.MemberNotificationRepositoryPort
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationDto
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationStreamPayload
import jakarta.annotation.PreDestroy
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

@Service
class MemberNotificationSseService(
    private val memberNotificationRepository: MemberNotificationRepositoryPort,
    @param:Value("\${custom.member.notification.sse.maxEmittersPerMember:3}")
    private val maxEmittersPerMember: Int,
    @param:Value("\${custom.member.notification.sse.maxGlobalEmitters:2000}")
    private val maxGlobalEmitters: Int,
) {
    companion object {
        private const val DEFAULT_RETRY_MILLIS = 5_000L
        private const val MAX_REPLAY_NOTIFICATIONS = 100
    }

    private val emittersByMemberId = ConcurrentHashMap<Int, MutableSet<SseEmitter>>()
    private val heartbeatTasks = ConcurrentHashMap<SseEmitter, ScheduledFuture<*>>()
    private val emitterOwners = ConcurrentHashMap<SseEmitter, Int>()
    private val emitterConnectedAtEpochMillis = ConcurrentHashMap<SseEmitter, Long>()
    private val heartbeatScheduler =
        Executors.newSingleThreadScheduledExecutor { runnable ->
            Thread(runnable, "member-notification-sse-heartbeat").apply {
                isDaemon = true
            }
        }

    fun subscribe(
        memberId: Int,
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

        parseLastNotificationId(lastEventIdRaw)?.let { replayMissedNotificationEvents(memberId, emitter, it) }

        sendConnectedEvent(emitter)
        registerHeartbeat(memberId, emitter)

        return emitter
    }

    fun publish(
        memberId: Int,
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

    private fun send(
        emitter: SseEmitter,
        memberId: Int?,
        eventId: String,
        eventName: String,
        data: Any,
    ) {
        try {
            emitter.send(
                SseEmitter
                    .event()
                    .id(eventId)
                    .name(eventName)
                    .reconnectTime(DEFAULT_RETRY_MILLIS)
                    .data(data, MediaType.APPLICATION_JSON),
            )
        } catch (_: Exception) {
            memberId?.let { remove(it, emitter) }
        }
    }

    private fun sendHeartbeat(
        memberId: Int,
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

    private fun registerHeartbeat(
        memberId: Int,
        emitter: SseEmitter,
    ) {
        val task =
            heartbeatScheduler.scheduleAtFixedRate(
                { sendHeartbeat(memberId, emitter) },
                20,
                20,
                TimeUnit.SECONDS,
            )

        heartbeatTasks[emitter] = task
    }

    private fun remove(
        memberId: Int,
        emitter: SseEmitter,
    ) {
        heartbeatTasks.remove(emitter)?.cancel(true)
        emitterOwners.remove(emitter)
        emitterConnectedAtEpochMillis.remove(emitter)
        emittersByMemberId[memberId]?.remove(emitter)
        if (emittersByMemberId[memberId].isNullOrEmpty()) {
            emittersByMemberId.remove(memberId)
        }
    }

    private fun enforceMemberEmitterLimit(
        memberId: Int,
        emitters: MutableSet<SseEmitter>,
    ) {
        val safeLimit = maxEmittersPerMember.coerceAtLeast(1)
        while (emitters.size > safeLimit) {
            val oldestEmitter = emitters.minByOrNull { emitterConnectedAtEpochMillis[it] ?: Long.MAX_VALUE } ?: return
            remove(memberId, oldestEmitter)
            runCatching { oldestEmitter.complete() }
        }
    }

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

    private fun replayMissedNotificationEvents(
        memberId: Int,
        emitter: SseEmitter,
        lastNotificationId: Int,
    ) {
        val unreadCount = memberNotificationRepository.countUnreadByReceiverId(memberId).toInt()
        val notifications =
            memberNotificationRepository.findByReceiverIdAndIdGreaterThan(
                receiverId = memberId,
                lastNotificationId = lastNotificationId,
                limit = MAX_REPLAY_NOTIFICATIONS,
            )

        notifications.forEach { notification ->
            val payload = MemberNotificationStreamPayload(MemberNotificationDto(notification), unreadCount)
            try {
                emitter.send(
                    SseEmitter
                        .event()
                        .id(notificationEventId(notification.id))
                        .name("notification")
                        .reconnectTime(DEFAULT_RETRY_MILLIS)
                        .data(payload, MediaType.APPLICATION_JSON),
                )
            } catch (_: Exception) {
                remove(memberId, emitter)
                return
            }
        }
    }

    private fun parseLastNotificationId(lastEventIdRaw: String?): Int? {
        val raw = lastEventIdRaw?.trim().orEmpty()
        if (raw.isBlank()) return null
        if (raw.startsWith("notification-")) return raw.removePrefix("notification-").toIntOrNull()
        return raw.toIntOrNull()
    }

    private fun notificationEventId(notificationId: Int): String = "notification-$notificationId"

    @PreDestroy
    fun shutdownHeartbeatScheduler() {
        heartbeatScheduler.shutdownNow()
    }
}
