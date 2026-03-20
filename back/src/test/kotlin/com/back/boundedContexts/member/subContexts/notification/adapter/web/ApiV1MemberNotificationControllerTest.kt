package com.back.boundedContexts.member.subContexts.notification.adapter.web

import com.back.boundedContexts.member.model.shared.Member
import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationApplicationService
import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationSseService
import com.back.global.web.application.Rq
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock

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

        val result = controller.getSnapshot()

        assertThat(result.items).isEmpty()
        assertThat(result.unreadCount).isZero()
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
}
