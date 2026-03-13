package com.back.boundedContexts.member.subContexts.notification.adapter.`in`.web

import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationApplicationService
import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationSseService
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationDto
import com.back.global.rsData.RsData
import com.back.global.web.app.Rq
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.MediaType
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

@RestController
@RequestMapping("/member/api/v1/notifications")
class ApiV1MemberNotificationController(
    private val memberNotificationApplicationService: MemberNotificationApplicationService,
    private val memberNotificationSseService: MemberNotificationSseService,
    private val rq: Rq,
) {
    data class UnreadCountResBody(
        val unreadCount: Int,
    )

    @GetMapping
    @Transactional(readOnly = true)
    fun getItems(): List<MemberNotificationDto> = memberNotificationApplicationService.getLatest(rq.actor)

    @GetMapping("/unread-count")
    @Transactional(readOnly = true)
    fun unreadCount(): UnreadCountResBody = UnreadCountResBody(memberNotificationApplicationService.unreadCount(rq.actor))

    @GetMapping("/stream", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun stream(
        response: HttpServletResponse,
        @RequestHeader(name = "Last-Event-ID", required = false) lastEventIdHeader: String?,
        @RequestParam(name = "lastEventId", required = false) lastEventIdQuery: String?,
    ): SseEmitter {
        response.setHeader("Cache-Control", "no-cache, no-transform")
        response.setHeader("Connection", "keep-alive")
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
        @PathVariable id: Int,
    ): RsData<Map<String, Boolean>> {
        val updated = memberNotificationApplicationService.markRead(rq.actor, id)
        return RsData("200-2", "알림을 읽음 처리했습니다.", mapOf("updated" to updated))
    }
}
