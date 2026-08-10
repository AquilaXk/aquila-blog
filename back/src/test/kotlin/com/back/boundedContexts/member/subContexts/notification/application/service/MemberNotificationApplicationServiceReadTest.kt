package com.back.boundedContexts.member.subContexts.notification.application.service

import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.model.shared.Member
import com.back.boundedContexts.member.subContexts.notification.application.port.output.MemberNotificationRepositoryPort
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import com.back.boundedContexts.post.application.port.output.PostCommentRepositoryPort
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.catchThrowable
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock

@DisplayName("MemberNotificationApplicationService 읽기 실패 계약")
class MemberNotificationApplicationServiceReadTest {
    private val memberRepository = mock(MemberRepositoryPort::class.java)
    private val postCommentRepository = mock(PostCommentRepositoryPort::class.java)
    private val notificationRepository = mock(MemberNotificationRepositoryPort::class.java)
    private val realtimeRelayService = mock(MemberNotificationRealtimeRelayService::class.java)
    private val service =
        MemberNotificationApplicationService(
            memberRepository = memberRepository,
            postCommentRepository = postCommentRepository,
            memberNotificationRepository = notificationRepository,
            memberNotificationRealtimeRelayService = realtimeRelayService,
        )
    private val member =
        Member(
            id = 11,
            username = "reader11",
            password = null,
            nickname = "독자11",
            email = "reader11@test.com",
        )

    @Test
    @DisplayName("알림 DTO 변환 실패는 항목을 누락하지 않고 typed unavailable로 실패한다")
    fun `latest dto failure is unavailable`() {
        val poisonNotification = mock(MemberNotification::class.java)
        given(poisonNotification.id).willReturn(41)
        given(poisonNotification.type).willThrow(IllegalStateException("dto conversion failed"))
        given(notificationRepository.findLatestByReceiverId(member.id)).willReturn(listOf(poisonNotification))

        val thrown = catchThrowable { service.getLatest(member) }

        assertUnavailable(thrown)
    }

    @Test
    @DisplayName("unread repository 실패는 0이 아니라 typed unavailable로 실패한다")
    fun `unread repository failure is unavailable`() {
        given(notificationRepository.countUnreadByReceiverId(member.id))
            .willThrow(IllegalStateException("repository unavailable"))

        val thrown = catchThrowable { service.unreadCount(member) }

        assertUnavailable(thrown)
    }

    @Test
    @DisplayName("snapshot repository 실패는 빈 목록과 0으로 폴백하지 않는다")
    fun `snapshot repository failure is unavailable`() {
        given(notificationRepository.findLatestByReceiverId(member.id))
            .willThrow(IllegalStateException("repository unavailable"))

        val thrown = catchThrowable { service.getSnapshot(member) }

        assertUnavailable(thrown)
    }

    private fun assertUnavailable(thrown: Throwable?) {
        assertThat(thrown).isInstanceOf(AppException::class.java)
        assertThat((thrown as AppException).errorCode).isEqualTo(ErrorCode.SERVICE_UNAVAILABLE)
    }
}
