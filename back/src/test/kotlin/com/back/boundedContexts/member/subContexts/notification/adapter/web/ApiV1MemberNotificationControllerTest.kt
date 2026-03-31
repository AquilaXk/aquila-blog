package com.back.boundedContexts.member.subContexts.notification.adapter.web

import com.back.boundedContexts.member.model.shared.Member
import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationApplicationService
import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationSseService
import com.back.global.web.application.Rq
import jakarta.servlet.http.HttpServletResponse
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.web.context.request.ServletWebRequest
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

@DisplayName("ApiV1MemberNotificationController 단위 테스트")
class ApiV1MemberNotificationControllerTest {
    @Test
    @DisplayName("snapshot 조회 중 예기치 못한 예외가 발생해도 빈 스냅샷으로 폴백한다")
    fun `snapshot unexpected exception fallback`() {
        val memberNotificationApplicationService = mock(MemberNotificationApplicationService::class.java)
        val memberNotificationSseService = mock(MemberNotificationSseService::class.java)
        val rq = mock(Rq::class.java)
        val actor = Member(id = 1, username = "user1", password = null, nickname = "유저", email = "u@test.com")

        given(rq.actorOrNull).willReturn(actor)
        given(memberNotificationApplicationService.getSnapshotSafe(actor)).willThrow(RuntimeException("unexpected"))

        val controller =
            ApiV1MemberNotificationController(
                memberNotificationApplicationService = memberNotificationApplicationService,
                memberNotificationSseService = memberNotificationSseService,
                rq = rq,
            )
        val webRequest = ServletWebRequest(MockHttpServletRequest(), MockHttpServletResponse())

        val result = controller.getSnapshot(webRequest)

        assertThat(result.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(result.body?.items).isEmpty()
        assertThat(result.body?.unreadCount).isZero()
        assertThat(result.headers.eTag).isNotBlank()
    }

    @Test
    @DisplayName("snapshot은 If-None-Match가 동일하면 304 Not Modified를 반환한다")
    fun `snapshot if none match returns not modified`() {
        val memberNotificationApplicationService = mock(MemberNotificationApplicationService::class.java)
        val memberNotificationSseService = mock(MemberNotificationSseService::class.java)
        val rq = mock(Rq::class.java)
        val actor = Member(id = 11, username = "user11", password = null, nickname = "유저11", email = "u11@test.com")

        given(rq.actorOrNull).willReturn(actor)
        given(memberNotificationApplicationService.getSnapshotSafe(actor))
            .willReturn(
                MemberNotificationApplicationService.NotificationSnapshot(
                    items = emptyList(),
                    unreadCount = 0,
                ),
            )

        val controller =
            ApiV1MemberNotificationController(
                memberNotificationApplicationService = memberNotificationApplicationService,
                memberNotificationSseService = memberNotificationSseService,
                rq = rq,
            )

        val firstWebRequest = ServletWebRequest(MockHttpServletRequest(), MockHttpServletResponse())
        val firstResponse = controller.getSnapshot(firstWebRequest)
        val eTag = requireNotNull(firstResponse.headers.eTag)

        val cachedRequest =
            MockHttpServletRequest().apply {
                addHeader("If-None-Match", eTag)
            }
        val secondWebRequest = ServletWebRequest(cachedRequest, MockHttpServletResponse())
        val secondResponse = controller.getSnapshot(secondWebRequest)

        assertThat(firstResponse.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(eTag).isNotBlank()
        assertThat(secondResponse.statusCode).isEqualTo(HttpStatus.NOT_MODIFIED)
        assertThat(secondResponse.body).isNull()
    }

    @Test
    @DisplayName("actor 조회 단계에서 예외가 발생해도 unread-count는 0으로 폴백한다")
    fun `unread count actor failure fallback`() {
        val memberNotificationApplicationService = mock(MemberNotificationApplicationService::class.java)
        val memberNotificationSseService = mock(MemberNotificationSseService::class.java)
        val rq = mock(Rq::class.java)

        given(rq.actorOrNull).willThrow(RuntimeException("actor failure"))

        val controller =
            ApiV1MemberNotificationController(
                memberNotificationApplicationService = memberNotificationApplicationService,
                memberNotificationSseService = memberNotificationSseService,
                rq = rq,
            )

        val result = controller.unreadCount()

        assertThat(result.unreadCount).isZero()
    }

    @Test
    @DisplayName("notification SSE stream 응답은 HTTP2 금지 헤더(Connection)를 세팅하지 않는다")
    fun `stream does not set connection header`() {
        val memberNotificationApplicationService = mock(MemberNotificationApplicationService::class.java)
        val memberNotificationSseService = mock(MemberNotificationSseService::class.java)
        val rq = mock(Rq::class.java)
        val response = mock(HttpServletResponse::class.java)
        val emitter = mock(SseEmitter::class.java)
        val actor = Member(id = 7, username = "user7", password = null, nickname = "유저7", email = "u7@test.com")

        given(rq.actor).willReturn(actor)
        given(memberNotificationSseService.subscribe(actor.id, "query-last-event-id")).willReturn(emitter)

        val controller =
            ApiV1MemberNotificationController(
                memberNotificationApplicationService = memberNotificationApplicationService,
                memberNotificationSseService = memberNotificationSseService,
                rq = rq,
            )

        val result =
            controller.stream(
                response = response,
                lastEventIdHeader = "header-last-event-id",
                lastEventIdQuery = "query-last-event-id",
            )

        assertThat(result).isSameAs(emitter)
        verify(response).setHeader("Cache-Control", "no-cache, no-transform")
        verify(response).setHeader("X-Accel-Buffering", "no")
        verify(response, never()).setHeader("Connection", "keep-alive")
        verify(memberNotificationSseService).subscribe(actor.id, "query-last-event-id")
    }
}
