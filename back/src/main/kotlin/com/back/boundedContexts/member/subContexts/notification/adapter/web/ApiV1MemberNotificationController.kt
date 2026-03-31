package com.back.boundedContexts.member.subContexts.notification.adapter.web

import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationApplicationService
import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationSseService
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationDto
import com.back.global.rsData.RsData
import com.back.global.web.application.Rq
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

/**
 * ApiV1MemberNotificationController는 웹 계층에서 HTTP 요청/응답을 처리하는 클래스입니다.
 * 입력 DTO 검증과 응답 포맷팅을 담당하고 비즈니스 처리는 애플리케이션 계층에 위임합니다.
 */
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

    @GetMapping
    fun getItems(): List<MemberNotificationDto> {
        return runCatching {
            val actor = rq.actorOrNull ?: return emptyList()
            runCatching { memberNotificationApplicationService.getLatest(actor) }
                .onFailure { exception ->
                    logger.warn(
                        "notification_items_fallback actorId={} reason={}",
                        actor.id,
                        exception::class.java.simpleName,
                        exception,
                    )
                }.getOrDefault(emptyList())
        }.getOrElse { exception ->
            logger.error(
                "notification_items_unexpected_fallback reason={}",
                exception::class.java.simpleName,
                exception,
            )
            emptyList()
        }
    }

    @GetMapping("/snapshot")
    fun getSnapshot(): SnapshotResBody {
        return runCatching {
            val actor = rq.actorOrNull ?: return SnapshotResBody(items = emptyList(), unreadCount = 0)
            val snapshot =
                runCatching { memberNotificationApplicationService.getSnapshotSafe(actor) }
                    .onFailure { exception ->
                        logger.warn(
                            "notification_snapshot_fallback actorId={} reason={}",
                            actor.id,
                            exception::class.java.simpleName,
                            exception,
                        )
                    }.getOrElse {
                        MemberNotificationApplicationService.NotificationSnapshot(
                            items = emptyList(),
                            unreadCount = 0,
                        )
                    }
            SnapshotResBody(
                items = snapshot.items,
                unreadCount = snapshot.unreadCount,
            )
        }.getOrElse { exception ->
            logger.error(
                "notification_snapshot_unexpected_fallback reason={}",
                exception::class.java.simpleName,
                exception,
            )
            SnapshotResBody(items = emptyList(), unreadCount = 0)
        }
    }

    @GetMapping("/unread-count")
    fun unreadCount(): UnreadCountResBody {
        return runCatching {
            val actor = rq.actorOrNull ?: return UnreadCountResBody(0)
            val unreadCount =
                runCatching { memberNotificationApplicationService.unreadCountSafe(actor) }
                    .onFailure { exception ->
                        logger.warn(
                            "notification_unread_count_controller_fallback actorId={} reason={}",
                            actor.id,
                            exception::class.java.simpleName,
                            exception,
                        )
                    }.getOrDefault(0)
            UnreadCountResBody(unreadCount)
        }.getOrElse { exception ->
            logger.error(
                "notification_unread_count_unexpected_fallback reason={}",
                exception::class.java.simpleName,
                exception,
            )
            UnreadCountResBody(0)
        }
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
