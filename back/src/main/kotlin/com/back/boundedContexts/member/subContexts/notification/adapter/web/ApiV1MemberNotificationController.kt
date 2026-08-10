package com.back.boundedContexts.member.subContexts.notification.adapter.web

import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationApplicationService
import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationSseService
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationDto
import com.back.global.rsData.RsData
import com.back.global.web.application.Rq
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.context.request.RequestAttributes
import org.springframework.web.context.request.WebRequest
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

@RestController
@RequestMapping("/member/api/v1/notifications")
class ApiV1MemberNotificationController(
    private val memberNotificationApplicationService: MemberNotificationApplicationService,
    private val memberNotificationSseService: MemberNotificationSseService,
    private val rq: Rq,
) {
    private val logger = LoggerFactory.getLogger(ApiV1MemberNotificationController::class.java)

    data class SnapshotResBody(
        val items: List<MemberNotificationDto>,
        val unreadCount: Int,
    )

    data class UnreadCountResBody(
        val unreadCount: Int,
    )

    private data class SnapshotPayload(
        val memberId: Long?,
        val body: SnapshotResBody,
    )

    @GetMapping
    fun getItems(): List<MemberNotificationDto> {
        val actor = rq.actorOrNull ?: return emptyList()
        return memberNotificationApplicationService.getLatest(actor)
    }

    @GetMapping("/snapshot")
    fun getSnapshot(webRequest: WebRequest): ResponseEntity<SnapshotResBody> {
        val startNs = System.nanoTime()
        val requestId =
            (webRequest.getAttribute("requestId", RequestAttributes.SCOPE_REQUEST) as? String)
                ?.takeIf { it.isNotBlank() }
                ?: "-"
        val ifNoneMatchPresent = !webRequest.getHeader("If-None-Match").isNullOrBlank()
        val actor = rq.actorOrNull
        val payload =
            if (actor == null) {
                SnapshotPayload(
                    memberId = null,
                    body = SnapshotResBody(items = emptyList(), unreadCount = 0),
                )
            } else {
                val snapshot = memberNotificationApplicationService.getSnapshot(actor)
                SnapshotPayload(
                    memberId = actor.id,
                    body = SnapshotResBody(items = snapshot.items, unreadCount = snapshot.unreadCount),
                )
            }
        val eTag = buildSnapshotETag(payload)
        if (webRequest.checkNotModified(eTag)) {
            logSnapshotServed(
                requestId = requestId,
                actorId = payload.memberId,
                status = HttpStatus.NOT_MODIFIED.value(),
                notModified = true,
                ifNoneMatchPresent = ifNoneMatchPresent,
                itemCount = payload.body.items.size,
                unreadCount = payload.body.unreadCount,
                eTag = eTag,
                latencyMs = (System.nanoTime() - startNs) / 1_000_000,
            )
            return ResponseEntity
                .status(HttpStatus.NOT_MODIFIED)
                .cacheControl(CacheControl.noCache())
                .eTag(eTag)
                .build()
        }
        logSnapshotServed(
            requestId = requestId,
            actorId = payload.memberId,
            status = HttpStatus.OK.value(),
            notModified = false,
            ifNoneMatchPresent = ifNoneMatchPresent,
            itemCount = payload.body.items.size,
            unreadCount = payload.body.unreadCount,
            eTag = eTag,
            latencyMs = (System.nanoTime() - startNs) / 1_000_000,
        )
        return ResponseEntity
            .ok()
            .cacheControl(CacheControl.noCache())
            .eTag(eTag)
            .body(payload.body)
    }

    private fun buildSnapshotETag(payload: SnapshotPayload): String {
        val seed =
            buildString {
                append(payload.memberId ?: -1L)
                append('|')
                append(payload.body.unreadCount)
                append('|')
                payload.body.items.forEach { item ->
                    append(item.id)
                    append(':')
                    append(item.createdAt.toEpochMilli())
                    append(':')
                    append(item.type.name)
                    append(':')
                    append(item.actorId)
                    append(':')
                    append(item.postId)
                    append(':')
                    append(item.commentId)
                    append(':')
                    append(item.isRead)
                    append(';')
                }
            }
        val digest = MessageDigest.getInstance("SHA-256").digest(seed.toByteArray(StandardCharsets.UTF_8))
        return digest.joinToString(separator = "") { byte -> "%02x".format(byte) }
    }

    private fun logSnapshotServed(
        requestId: String,
        actorId: Long?,
        status: Int,
        notModified: Boolean,
        ifNoneMatchPresent: Boolean,
        itemCount: Int,
        unreadCount: Int,
        eTag: String,
        latencyMs: Long,
    ) {
        logger.info(
            "notification_snapshot_served requestId={} actorId={} status={} notModified={} ifNoneMatchPresent={} itemCount={} unreadCount={} eTag={} latencyMs={} clientIp={}",
            requestId,
            actorId ?: -1L,
            status,
            notModified,
            ifNoneMatchPresent,
            itemCount,
            unreadCount,
            eTag.take(16),
            latencyMs,
            rq.clientIp,
        )
    }

    @GetMapping("/unread-count")
    fun unreadCount(): UnreadCountResBody {
        val actor = rq.actorOrNull ?: return UnreadCountResBody(0)
        return UnreadCountResBody(memberNotificationApplicationService.unreadCount(actor))
    }

    @GetMapping("/stream", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun stream(
        response: HttpServletResponse,
        @RequestHeader(name = "Last-Event-ID", required = false) lastEventIdHeader: String?,
        @RequestParam(name = "lastEventId", required = false) lastEventIdQuery: String?,
    ): SseEmitter {
        response.setHeader("Cache-Control", "no-cache, no-transform")
        response.setHeader("X-Accel-Buffering", "no")
        return memberNotificationSseService.subscribe(
            memberId = rq.actor.id,
            lastEventIdRaw = lastEventIdQuery ?: lastEventIdHeader,
        )
    }

    @PostMapping("/read-all")
    @Transactional
    fun markAllRead(): RsData<Map<String, Int>> {
        val count = memberNotificationApplicationService.markAllRead(rq.actor)
        return RsData("200-1", "알림을 모두 읽음 처리했습니다.", mapOf("updatedCount" to count))
    }

    @PostMapping("/{id}/read")
    @Transactional
    fun markRead(
        @PathVariable id: Long,
    ): RsData<Map<String, Boolean>> {
        val updated = memberNotificationApplicationService.markRead(rq.actor, id)
        return RsData("200-2", "알림을 읽음 처리했습니다.", mapOf("updated" to updated))
    }
}
