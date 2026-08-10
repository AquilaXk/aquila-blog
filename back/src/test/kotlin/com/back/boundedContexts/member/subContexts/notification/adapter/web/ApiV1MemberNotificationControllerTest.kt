package com.back.boundedContexts.member.subContexts.notification.adapter.web

import com.back.boundedContexts.member.model.shared.Member
import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationApplicationService
import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationSseService
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.web.application.Rq
import jakarta.servlet.http.HttpServletResponse
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.catchThrowable
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
    @DisplayName("비로그인 notification 읽기는 기존 empty·zero 계약을 유지한다")
    fun `anonymous notification reads remain empty`() {
        val memberNotificationApplicationService = mock(MemberNotificationApplicationService::class.java)
        val memberNotificationSseService = mock(MemberNotificationSseService::class.java)
        val rq = mock(Rq::class.java)
        given(rq.actorOrNull).willReturn(null)
        val controller =
            ApiV1MemberNotificationController(
                memberNotificationApplicationService = memberNotificationApplicationService,
                memberNotificationSseService = memberNotificationSseService,
                rq = rq,
            )

        val items = controller.getItems()
        val unread = controller.unreadCount()
        val snapshot = controller.getSnapshot(ServletWebRequest(MockHttpServletRequest(), MockHttpServletResponse()))

        assertThat(items).isEmpty()
        assertThat(unread.unreadCount).isZero()
        assertThat(snapshot.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(snapshot.body?.items).isEmpty()
        assertThat(snapshot.body?.unreadCount).isZero()
    }

    @Test
    @DisplayName("인증된 list 조회 실패는 빈 성공 응답으로 바꾸지 않는다")
    fun `authenticated list failure is unavailable`() {
        val memberNotificationApplicationService = mock(MemberNotificationApplicationService::class.java)
        val memberNotificationSseService = mock(MemberNotificationSseService::class.java)
        val rq = mock(Rq::class.java)
        val actor = Member(id = 13, username = "user13", password = null, nickname = "유저13", email = "u13@test.com")
        given(rq.actorOrNull).willReturn(actor)
        given(memberNotificationApplicationService.getLatest(actor))
            .willThrow(AppException(ErrorCode.SERVICE_UNAVAILABLE))
        val controller =
            ApiV1MemberNotificationController(
                memberNotificationApplicationService = memberNotificationApplicationService,
                memberNotificationSseService = memberNotificationSseService,
                rq = rq,
            )

        val thrown = catchThrowable { controller.getItems() }

        assertThat(thrown).isInstanceOf(AppException::class.java)
        assertThat((thrown as AppException).errorCode).isEqualTo(ErrorCode.SERVICE_UNAVAILABLE)
    }

    @Test
    @DisplayName("인증된 snapshot 조회 실패는 빈 성공 응답으로 바꾸지 않는다")
    fun `authenticated snapshot failure is unavailable`() {
        val memberNotificationApplicationService = mock(MemberNotificationApplicationService::class.java)
        val memberNotificationSseService = mock(MemberNotificationSseService::class.java)
        val rq = mock(Rq::class.java)
        val actor = Member(id = 1, username = "user1", password = null, nickname = "유저", email = "u@test.com")

        given(rq.actorOrNull).willReturn(actor)
        given(memberNotificationApplicationService.getSnapshot(actor))
            .willThrow(AppException(ErrorCode.SERVICE_UNAVAILABLE))

        val controller =
            ApiV1MemberNotificationController(
                memberNotificationApplicationService = memberNotificationApplicationService,
                memberNotificationSseService = memberNotificationSseService,
                rq = rq,
            )
        val webRequest = ServletWebRequest(MockHttpServletRequest(), MockHttpServletResponse())

        val thrown = catchThrowable { controller.getSnapshot(webRequest) }

        assertThat(thrown).isInstanceOf(AppException::class.java)
        assertThat((thrown as AppException).errorCode).isEqualTo(ErrorCode.SERVICE_UNAVAILABLE)
    }

    @Test
    @DisplayName("snapshot은 If-None-Match가 동일하면 304 Not Modified를 반환한다")
    fun `snapshot if none match returns not modified`() {
        val memberNotificationApplicationService = mock(MemberNotificationApplicationService::class.java)
        val memberNotificationSseService = mock(MemberNotificationSseService::class.java)
        val rq = mock(Rq::class.java)
        val actor = Member(id = 11, username = "user11", password = null, nickname = "유저11", email = "u11@test.com")

        given(rq.actorOrNull).willReturn(actor)
        given(memberNotificationApplicationService.getSnapshot(actor))
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
    @DisplayName("인증된 unread-count 의존성 실패는 0 성공 응답으로 바꾸지 않는다")
    fun `authenticated unread count failure is unavailable`() {
        val memberNotificationApplicationService = mock(MemberNotificationApplicationService::class.java)
        val memberNotificationSseService = mock(MemberNotificationSseService::class.java)
        val rq = mock(Rq::class.java)

        val actor = Member(id = 12, username = "user12", password = null, nickname = "유저12", email = "u12@test.com")
        given(rq.actorOrNull).willReturn(actor)
        given(memberNotificationApplicationService.unreadCount(actor))
            .willThrow(AppException(ErrorCode.SERVICE_UNAVAILABLE))

        val controller =
            ApiV1MemberNotificationController(
                memberNotificationApplicationService = memberNotificationApplicationService,
                memberNotificationSseService = memberNotificationSseService,
                rq = rq,
            )

        val thrown = catchThrowable { controller.unreadCount() }

        assertThat(thrown).isInstanceOf(AppException::class.java)
        assertThat((thrown as AppException).errorCode).isEqualTo(ErrorCode.SERVICE_UNAVAILABLE)
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
