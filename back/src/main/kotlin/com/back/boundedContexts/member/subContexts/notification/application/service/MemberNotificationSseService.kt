package com.back.boundedContexts.member.subContexts.notification.application.service

import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationDto
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationStreamPayload
import jakarta.annotation.PreDestroy
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Instant
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

@Service
class MemberNotificationSseService {
    private data class StreamEvent(
        val id: Long,
        val eventName: String,
        val data: Any,
        val reconnectMillis: Long,
    )

    companion object {
        private const val DEFAULT_RETRY_MILLIS = 5_000L
        private const val MAX_RECENT_NOTIFICATION_EVENTS = 100
    }

    private val emittersByMemberId = ConcurrentHashMap<Int, MutableSet<SseEmitter>>()
    private val heartbeatTasks = ConcurrentHashMap<SseEmitter, ScheduledFuture<*>>()
    private val recentNotificationEventsByMemberId = ConcurrentHashMap<Int, MutableList<StreamEvent>>()
    private val eventSequence = AtomicLong(0)
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

        emitter.onCompletion { remove(memberId, emitter) }
        emitter.onTimeout { remove(memberId, emitter) }
        emitter.onError { remove(memberId, emitter) }

        parseLastEventId(lastEventIdRaw)?.let { replayMissedNotificationEvents(memberId, emitter, it) }

        send(
            emitter = emitter,
            memberId = memberId,
            eventName = "connected",
            data = mapOf("connectedAt" to Instant.now().toString()),
            persistForReplay = false,
        )
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
                    eventName = "notification",
                    data = payload,
                    persistForReplay = true,
                )
            }
    }

    private fun send(
        emitter: SseEmitter,
        memberId: Int,
        eventName: String,
        data: Any,
        persistForReplay: Boolean,
    ) {
        val event =
            StreamEvent(
                id = eventSequence.incrementAndGet(),
                eventName = eventName,
                data = data,
                reconnectMillis = DEFAULT_RETRY_MILLIS,
            )

        if (persistForReplay) {
            persistNotificationEvent(memberId, event)
        }

        try {
            emitter.send(
                SseEmitter
                    .event()
                    .id(event.id.toString())
                    .name(event.eventName)
                    .reconnectTime(event.reconnectMillis)
                    .data(event.data, MediaType.APPLICATION_JSON),
            )
        } catch (_: Exception) {
            remove(memberId, emitter)
        }
    }

    private fun sendHeartbeat(
        memberId: Int,
        emitter: SseEmitter,
    ) {
        send(
            emitter = emitter,
            memberId = memberId,
            eventName = "heartbeat",
            data = mapOf("heartbeatAt" to Instant.now().toString()),
            persistForReplay = false,
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
        emittersByMemberId[memberId]?.remove(emitter)
        if (emittersByMemberId[memberId].isNullOrEmpty()) {
            emittersByMemberId.remove(memberId)
        }
    }

    private fun persistNotificationEvent(
        memberId: Int,
        event: StreamEvent,
    ) {
        val buffer =
            recentNotificationEventsByMemberId.computeIfAbsent(memberId) {
                Collections.synchronizedList(mutableListOf())
            }

        synchronized(buffer) {
            buffer.add(event)
            val overflow = buffer.size - MAX_RECENT_NOTIFICATION_EVENTS
            if (overflow > 0) {
                buffer.subList(0, overflow).clear()
            }
        }
    }

    private fun replayMissedNotificationEvents(
        memberId: Int,
        emitter: SseEmitter,
        lastEventId: Long,
    ) {
        val buffer = recentNotificationEventsByMemberId[memberId] ?: return
        val missed =
            synchronized(buffer) {
                buffer.filter { it.id > lastEventId }.toList()
            }

        missed.forEach { event ->
            try {
                emitter.send(
                    SseEmitter
                        .event()
                        .id(event.id.toString())
                        .name(event.eventName)
                        .reconnectTime(event.reconnectMillis)
                        .data(event.data, MediaType.APPLICATION_JSON),
                )
            } catch (_: Exception) {
                remove(memberId, emitter)
                return
            }
        }
    }

    private fun parseLastEventId(lastEventIdRaw: String?): Long? = lastEventIdRaw?.trim()?.toLongOrNull()

    @PreDestroy
    fun shutdownHeartbeatScheduler() {
        heartbeatScheduler.shutdownNow()
    }
}
