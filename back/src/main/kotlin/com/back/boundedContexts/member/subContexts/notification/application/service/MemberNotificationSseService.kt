package com.back.boundedContexts.member.subContexts.notification.application.service

import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationDto
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationStreamPayload
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.io.IOException
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

@Service
class MemberNotificationSseService {
    private val emittersByMemberId = ConcurrentHashMap<Int, MutableSet<SseEmitter>>()

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
        } catch (_: IOException) {
            remove(memberId, emitter)
        }
    }

    private fun remove(
        memberId: Int,
        emitter: SseEmitter,
    ) {
        emittersByMemberId[memberId]?.remove(emitter)
        if (emittersByMemberId[memberId].isNullOrEmpty()) {
            emittersByMemberId.remove(memberId)
        }
    }
}
