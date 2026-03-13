package com.back.boundedContexts.member.subContexts.notification.application.service

import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationDto
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationStreamPayload
import jakarta.annotation.PreDestroy
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

@Service
class MemberNotificationSseService {
    private val emittersByMemberId = ConcurrentHashMap<Int, MutableSet<SseEmitter>>()
    private val heartbeatTasks = ConcurrentHashMap<SseEmitter, ScheduledFuture<*>>()
    private val heartbeatScheduler =
        Executors.newSingleThreadScheduledExecutor { runnable ->
            Thread(runnable, "member-notification-sse-heartbeat").apply {
                isDaemon = true
            }
        }

    fun subscribe(memberId: Int): SseEmitter {
        val emitter = SseEmitter(0L)
        val emitters = emittersByMemberId.computeIfAbsent(memberId) { ConcurrentHashMap.newKeySet() }
        emitters.add(emitter)

        emitter.onCompletion { remove(memberId, emitter) }
        emitter.onTimeout { remove(memberId, emitter) }
        emitter.onError { remove(memberId, emitter) }

        send(
            emitter = emitter,
            memberId = memberId,
            eventName = "connected",
            data = mapOf("connectedAt" to Instant.now().toString()),
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
                )
            }
    }

    private fun send(
        emitter: SseEmitter,
        memberId: Int,
        eventName: String,
        data: Any,
    ) {
        try {
            emitter.send(
                SseEmitter
                    .event()
                    .name(eventName)
                    .data(data, MediaType.APPLICATION_JSON),
            )
        } catch (_: Exception) {
            remove(memberId, emitter)
        }
    }

    private fun sendHeartbeat(
        memberId: Int,
        emitter: SseEmitter,
    ) {
        try {
            emitter.send(
                SseEmitter
                    .event()
                    .comment("keepalive ${Instant.now()}"),
            )
        } catch (_: Exception) {
            remove(memberId, emitter)
        }
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

    @PreDestroy
    fun shutdownHeartbeatScheduler() {
        heartbeatScheduler.shutdownNow()
    }
}
