package com.back.boundedContexts.member.subContexts.notification.adapter.event

import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationApplicationService
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.willThrow
import org.mockito.Mockito.mock
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener

@DisplayName("MemberNotificationEventListener failure 계약")
class MemberNotificationEventListenerFailureTest {
    @Test
    @DisplayName("durable task publish transaction의 BEFORE_COMMIT phase에서 실행한다")
    fun `listener uses before commit phase`() {
        val annotation =
            MemberNotificationEventListener::class.java
                .getDeclaredMethod("handle", PostCommentWrittenEvent::class.java)
                .getAnnotation(TransactionalEventListener::class.java)

        assertThat(annotation.phase).isEqualTo(TransactionPhase.BEFORE_COMMIT)
    }

    @Test
    @DisplayName("notification row 생성 실패를 durable task 경계로 전파한다")
    fun `notification creation failure propagates`() {
        val applicationService = mock(MemberNotificationApplicationService::class.java)
        val listener = MemberNotificationEventListener(applicationService)
        val event = mock(PostCommentWrittenEvent::class.java)
        willThrow(IllegalStateException("notification persistence unavailable"))
            .given(applicationService)
            .createForCommentWritten(event)

        assertThatThrownBy { listener.handle(event) }
            .isInstanceOf(IllegalStateException::class.java)
    }
}
