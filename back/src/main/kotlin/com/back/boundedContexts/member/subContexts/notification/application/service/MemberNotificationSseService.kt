package com.back.boundedContexts.member.subContexts.notification.application.service

import com.back.boundedContexts.member.subContexts.notification.application.port.output.MemberNotificationRepositoryPort
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationDto
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationStreamPayload
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
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
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

@Service
class MemberNotificationSseService(
    private val memberNotificationRepository: MemberNotificationRepositoryPort,
    private val emitterFactory: MemberNotificationSseEmitterFactory,
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
    data class StreamDiagnostics(
        val memberEmitterCount: Int,
        val globalEmitterCount: Int,
        val oldestEmitterAgeSeconds: Long,
        val maxEmittersPerMember: Int,
        val maxGlobalEmitters: Int,
        val heartbeatSeconds: Long,
        val replayProbeSeconds: Long,
        val replayBatchSize: Int,
        val connectedCount: Long,
        val reconnectSubscribeCount: Long,
        val disconnectCount: Long,
        val replayBatchCount: Long,
        val replayNotificationCount: Long,
        val replayUnavailableNotificationCount: Long,
        val replayFailureCount: Long,
        val unreadUnavailableCount: Long,
        val heartbeatSentCount: Long,
        val sendFailureCount: Long,
        val sendFailureRemovedEmitterCount: Long,
        val emitterStateMismatchCount: Int,
    )

    private val logger = LoggerFactory.getLogger(MemberNotificationSseService::class.java)

    companion object {
        private const val DEFAULT_RETRY_MILLIS = 5_000L
        private const val MAX_REPLAY_NOTIFICATIONS = 100
    }

    init {
        require(maxEmittersPerMember > 0) { "maxEmittersPerMember must be positive" }
        require(maxGlobalEmitters > 0) { "maxGlobalEmitters must be positive" }
        require(heartbeatSeconds >= 3) { "heartbeatSeconds must be at least 3" }
        require(replayProbeSeconds >= heartbeatSeconds) { "replayProbeSeconds must be at least heartbeatSeconds" }
        require(replayBatchSize in 1..MAX_REPLAY_NOTIFICATIONS) {
            "replayBatchSize must be between 1 and $MAX_REPLAY_NOTIFICATIONS"
        }
    }

    private class NotificationSendFailedException : RuntimeException()

    private val stateLock = ReentrantLock()
    private val emittersByMemberId = ConcurrentHashMap<Long, MutableSet<SseEmitter>>()
    private val heartbeatTasks = ConcurrentHashMap<SseEmitter, ScheduledFuture<*>>()
    private val emitterOwners = ConcurrentHashMap<SseEmitter, Long>()
    private val emitterConnectedAtEpochMillis = ConcurrentHashMap<SseEmitter, Long>()
    private val emitterLastNotificationId = ConcurrentHashMap<SseEmitter, Long>()
    private val emitterLastReplayEpochMillis = ConcurrentHashMap<SseEmitter, Long>()
    private val connectedCount = AtomicLong(0)
    private val reconnectSubscribeCount = AtomicLong(0)
    private val disconnectCount = AtomicLong(0)
    private val replayBatchCount = AtomicLong(0)
    private val replayNotificationCount = AtomicLong(0)
    private val replayUnavailableNotificationCount = AtomicLong(0)
    private val replayFailureCount = AtomicLong(0)
    private val unreadUnavailableCount = AtomicLong(0)
    private val heartbeatSentCount = AtomicLong(0)
    private val sendFailureCount = AtomicLong(0)
    private val sendFailureRemovedEmitterCount = AtomicLong(0)
    private val heartbeatScheduler =
        Executors.newSingleThreadScheduledExecutor { runnable ->
            Thread(runnable, "member-notification-sse-heartbeat").apply {
                isDaemon = true
            }
        }

    fun subscribe(
        memberId: Long,
        lastEventIdRaw: String?,
    ): SseEmitter {
        val emitter = emitterFactory.create()
        emitter.onCompletion { remove(memberId, emitter) }
        emitter.onTimeout { remove(memberId, emitter) }
        emitter.onError { remove(memberId, emitter) }

        val replayFrom = parseLastNotificationId(lastEventIdRaw) ?: 0L
        val replayedLastId =
            try {
                replayMissedNotificationEvents(
                    memberId = memberId,
                    emitter = emitter,
                    lastNotificationId = replayFrom,
                )
            } catch (_: NotificationSendFailedException) {
                throw unavailableException()
            }

        registerEmitter(
            memberId = memberId,
            emitter = emitter,
            lastNotificationId = maxOf(replayFrom, replayedLastId),
        )
        if (!sendConnectedEvent(memberId, emitter)) {
            throw unavailableException()
        }

        connectedCount.incrementAndGet()
        if (replayFrom > 0L) {
            reconnectSubscribeCount.incrementAndGet()
        }
        registerHeartbeat(memberId, emitter)
        return emitter
    }

    fun publish(
        memberId: Long,
        notification: MemberNotificationDto,
        unreadCount: Int,
    ) {
        val payload = MemberNotificationStreamPayload(notification, unreadCount)
        emittersByMemberId[memberId]
            ?.toList()
            ?.forEach { emitter ->
                val sent =
                    send(
                        emitter = emitter,
                        memberId = memberId,
                        eventId = notificationEventId(notification.id),
                        eventName = "notification",
                        data = payload,
                    )
                if (sent) {
                    advanceCursorIfOwned(memberId, emitter, notification.id)
                }
            }
    }

    private fun registerEmitter(
        memberId: Long,
        emitter: SseEmitter,
        lastNotificationId: Long,
    ) {
        stateLock.withLock {
            val existingEmitters = emittersByMemberId.computeIfAbsent(memberId) { ConcurrentHashMap.newKeySet() }
            enforceMemberEmitterCapacity(memberId, existingEmitters)
            enforceGlobalEmitterCapacity()

            emittersByMemberId
                .computeIfAbsent(memberId) { ConcurrentHashMap.newKeySet() }
                .add(emitter)
            emitterOwners[emitter] = memberId
            emitterConnectedAtEpochMillis[emitter] = Instant.now().toEpochMilli()
            emitterLastNotificationId[emitter] = lastNotificationId
            emitterLastReplayEpochMillis[emitter] = Instant.now().toEpochMilli()
        }
    }

    private fun sendConnectedEvent(
        memberId: Long,
        emitter: SseEmitter,
    ): Boolean {
        val connectedAt = Instant.now()
        return send(
            emitter = emitter,
            memberId = memberId,
            eventId = null,
            eventName = "connected",
            data = mapOf("connectedAt" to connectedAt.toString()),
        )
    }

    private fun send(
        emitter: SseEmitter,
        memberId: Long?,
        eventId: String?,
        eventName: String,
        data: Any,
    ): Boolean {
        try {
            val eventBuilder = SseEmitter.event()
            eventId?.let(eventBuilder::id)
            eventBuilder
                .name(eventName)
                .reconnectTime(DEFAULT_RETRY_MILLIS)
                .data(data, MediaType.APPLICATION_JSON)
            emitter.send(eventBuilder)
            return true
        } catch (_: Exception) {
            sendFailureCount.incrementAndGet()
            if (memberId != null && remove(memberId, emitter)) {
                sendFailureRemovedEmitterCount.incrementAndGet()
            }
            return false
        }
    }

    private fun sendHeartbeat(
        memberId: Long,
        emitter: SseEmitter,
    ): Boolean {
        val heartbeatAt = Instant.now()
        val sent =
            send(
                emitter = emitter,
                memberId = memberId,
                eventId = null,
                eventName = "heartbeat",
                data = mapOf("heartbeatAt" to heartbeatAt.toString()),
            )
        if (sent) {
            heartbeatSentCount.incrementAndGet()
        }
        return sent
    }

    private fun registerHeartbeat(
        memberId: Long,
        emitter: SseEmitter,
    ) {
        val task =
            heartbeatScheduler.scheduleAtFixedRate(
                {
                    if (!sendHeartbeat(memberId, emitter)) {
                        return@scheduleAtFixedRate
                    }
                    if (!shouldProbeReplay(memberId, emitter)) {
                        return@scheduleAtFixedRate
                    }
                    replayOpenEmitter(memberId, emitter)
                },
                heartbeatSeconds,
                heartbeatSeconds,
                TimeUnit.SECONDS,
            )

        stateLock.withLock {
            if (emitterOwners[emitter] == memberId) {
                heartbeatTasks[emitter] = task
            } else {
                task.cancel(true)
            }
        }
    }

    internal fun replayOpenEmitter(
        memberId: Long,
        emitter: SseEmitter,
    ) {
        val cursor = lastNotificationId(memberId, emitter) ?: return
        try {
            replayMissedNotificationEvents(
                memberId = memberId,
                emitter = emitter,
                lastNotificationId = cursor,
            )
        } catch (_: NotificationSendFailedException) {
            // send() already removed the failed emitter. Servlet error dispatch owns completion.
        } catch (exception: AppException) {
            if (remove(memberId, emitter)) {
                emitter.completeWithError(exception)
            }
        }
    }

    private fun remove(
        memberId: Long,
        emitter: SseEmitter,
    ): Boolean =
        stateLock.withLock {
            if (emitterOwners[emitter] != memberId) {
                return@withLock false
            }
            emitterOwners.remove(emitter)
            heartbeatTasks.remove(emitter)?.cancel(true)
            emitterConnectedAtEpochMillis.remove(emitter)
            emitterLastNotificationId.remove(emitter)
            emitterLastReplayEpochMillis.remove(emitter)
            emittersByMemberId[memberId]?.remove(emitter)
            if (emittersByMemberId[memberId].isNullOrEmpty()) {
                emittersByMemberId.remove(memberId)
            }
            disconnectCount.incrementAndGet()
            true
        }

    private fun advanceCursorIfOwned(
        memberId: Long,
        emitter: SseEmitter,
        notificationId: Long,
    ): Boolean =
        stateLock.withLock {
            if (emitterOwners[emitter] != memberId || !emitterLastNotificationId.containsKey(emitter)) {
                return@withLock false
            }
            val previousId = emitterLastNotificationId.getValue(emitter)
            emitterLastNotificationId[emitter] = maxOf(previousId, notificationId)
            true
        }

    private fun lastNotificationId(
        memberId: Long,
        emitter: SseEmitter,
    ): Long? =
        stateLock.withLock {
            if (emitterOwners[emitter] != memberId) {
                null
            } else {
                emitterLastNotificationId[emitter]
            }
        }

    private fun shouldProbeReplay(
        memberId: Long,
        emitter: SseEmitter,
    ): Boolean =
        stateLock.withLock {
            if (emitterOwners[emitter] != memberId) {
                return@withLock false
            }
            val now = Instant.now().toEpochMilli()
            val replayIntervalMillis = replayProbeSeconds * 1_000
            val lastReplayAt = emitterLastReplayEpochMillis[emitter] ?: return@withLock false
            if (now - lastReplayAt < replayIntervalMillis) {
                return@withLock false
            }
            emitterLastReplayEpochMillis[emitter] = now
            true
        }

    private fun enforceMemberEmitterCapacity(
        memberId: Long,
        emitters: MutableSet<SseEmitter>,
    ) {
        while (emitters.size >= maxEmittersPerMember) {
            val oldestEmitter = emitters.minByOrNull { emitterConnectedAtEpochMillis[it] ?: Long.MAX_VALUE } ?: return
            remove(memberId, oldestEmitter)
            completeEvictedEmitter(oldestEmitter)
        }
    }

    private fun enforceGlobalEmitterCapacity() {
        while (emitterConnectedAtEpochMillis.size >= maxGlobalEmitters) {
            val oldestEmitter =
                emitterConnectedAtEpochMillis.entries
                    .minByOrNull { it.value }
                    ?.key
                    ?: return
            val ownerId = emitterOwners[oldestEmitter] ?: return
            remove(ownerId, oldestEmitter)
            completeEvictedEmitter(oldestEmitter)
        }
    }

    private fun completeEvictedEmitter(emitter: SseEmitter) {
        try {
            emitter.complete()
        } catch (exception: Exception) {
            logger.warn(
                "notification_emitter_eviction_completion_failed reasonType={}",
                exception::class.java.simpleName,
            )
        }
    }

    private fun replayMissedNotificationEvents(
        memberId: Long,
        emitter: SseEmitter,
        lastNotificationId: Long,
    ): Long {
        val notifications =
            try {
                memberNotificationRepository.findByReceiverIdAndIdGreaterThan(
                    receiverId = memberId,
                    lastNotificationId = lastNotificationId,
                    limit = replayBatchSize,
                )
            } catch (exception: Exception) {
                throw replayUnavailable(memberId, "list", exception)
            }
        if (notifications.isEmpty()) {
            return lastNotificationId
        }
        replayBatchCount.incrementAndGet()

        val unreadCount =
            try {
                memberNotificationRepository.countUnreadByReceiverId(memberId).toInt()
            } catch (exception: Exception) {
                unreadUnavailableCount.incrementAndGet()
                throw replayUnavailable(memberId, "unread-count", exception)
            }

        var latestId = lastNotificationId
        notifications.forEach { notification ->
            val notificationId =
                try {
                    notification.id
                } catch (exception: Exception) {
                    throw replayUnavailable(memberId, "notification-id", exception)
                }
            val dto =
                try {
                    MemberNotificationDto(notification)
                } catch (exception: Exception) {
                    logger.warn(
                        "notification_replay_item_unavailable memberId={} notificationId={} reasonType={}",
                        memberId,
                        notificationId,
                        exception::class.java.simpleName,
                    )
                    null
                }
            val unavailable = dto == null
            val sent =
                send(
                    emitter = emitter,
                    memberId = memberId,
                    eventId = notificationEventId(notificationId),
                    eventName = if (unavailable) "notification-unavailable" else "notification",
                    data =
                        dto?.let { MemberNotificationStreamPayload(it, unreadCount) }
                            ?: mapOf(
                                "notificationId" to notificationId,
                                "status" to "UNAVAILABLE",
                            ),
                )
            if (!sent) {
                throw NotificationSendFailedException()
            }

            latestId = maxOf(latestId, notificationId)
            advanceCursorIfOwned(memberId, emitter, notificationId)
            if (unavailable) {
                replayUnavailableNotificationCount.incrementAndGet()
            } else {
                replayNotificationCount.incrementAndGet()
            }
        }
        return latestId
    }

    private fun replayUnavailable(
        memberId: Long,
        operation: String,
        exception: Exception,
    ): AppException {
        replayFailureCount.incrementAndGet()
        logger.warn(
            "notification_replay_unavailable memberId={} operation={} reasonType={}",
            memberId,
            operation,
            exception::class.java.simpleName,
        )
        return AppException(
            errorCode = ErrorCode.SERVICE_UNAVAILABLE,
            cause = exception,
        )
    }

    private fun unavailableException(): AppException = AppException(ErrorCode.SERVICE_UNAVAILABLE)

    private fun parseLastNotificationId(lastEventIdRaw: String?): Long? {
        val raw = lastEventIdRaw?.trim().orEmpty()
        if (raw.isBlank()) {
            return null
        }
        val parsed =
            if (raw.startsWith("notification-")) {
                raw.removePrefix("notification-").toLongOrNull()
            } else {
                raw.toLongOrNull()
            }
        return parsed
            ?.takeIf { it >= 0 }
            ?: throw AppException(ErrorCode.BAD_REQUEST, "유효하지 않은 알림 cursor입니다.")
    }

    private fun notificationEventId(notificationId: Long): String = "notification-$notificationId"

    fun diagnostics(): StreamDiagnostics =
        stateLock.withLock {
            val now = Instant.now().toEpochMilli()
            val oldestConnectedAt = emitterConnectedAtEpochMillis.values.minOrNull()
            StreamDiagnostics(
                memberEmitterCount = emittersByMemberId.count { !it.value.isNullOrEmpty() },
                globalEmitterCount = emitterConnectedAtEpochMillis.size,
                oldestEmitterAgeSeconds =
                    oldestConnectedAt
                        ?.let { connectedAt -> ((now - connectedAt).coerceAtLeast(0) / 1_000) }
                        ?: 0,
                maxEmittersPerMember = maxEmittersPerMember,
                maxGlobalEmitters = maxGlobalEmitters,
                heartbeatSeconds = heartbeatSeconds,
                replayProbeSeconds = replayProbeSeconds,
                replayBatchSize = replayBatchSize,
                connectedCount = connectedCount.get(),
                reconnectSubscribeCount = reconnectSubscribeCount.get(),
                disconnectCount = disconnectCount.get(),
                replayBatchCount = replayBatchCount.get(),
                replayNotificationCount = replayNotificationCount.get(),
                replayUnavailableNotificationCount = replayUnavailableNotificationCount.get(),
                replayFailureCount = replayFailureCount.get(),
                unreadUnavailableCount = unreadUnavailableCount.get(),
                heartbeatSentCount = heartbeatSentCount.get(),
                sendFailureCount = sendFailureCount.get(),
                sendFailureRemovedEmitterCount = sendFailureRemovedEmitterCount.get(),
                emitterStateMismatchCount = emitterStateMismatchCount(),
            )
        }

    private fun emitterStateMismatchCount(): Int {
        val allEmitters = mutableSetOf<SseEmitter>()
        allEmitters.addAll(emitterOwners.keys)
        allEmitters.addAll(emitterConnectedAtEpochMillis.keys)
        allEmitters.addAll(emitterLastNotificationId.keys)
        allEmitters.addAll(emitterLastReplayEpochMillis.keys)
        allEmitters.addAll(heartbeatTasks.keys)
        emittersByMemberId.values.forEach(allEmitters::addAll)
        return allEmitters.count { emitter ->
            val ownerId = emitterOwners[emitter]
            ownerId == null ||
                emitterConnectedAtEpochMillis[emitter] == null ||
                emitterLastNotificationId[emitter] == null ||
                emitterLastReplayEpochMillis[emitter] == null ||
                heartbeatTasks[emitter] == null ||
                emittersByMemberId[ownerId]?.contains(emitter) != true
        }
    }

    @PreDestroy
    fun shutdownHeartbeatScheduler() {
        heartbeatScheduler.shutdownNow()
    }
}
