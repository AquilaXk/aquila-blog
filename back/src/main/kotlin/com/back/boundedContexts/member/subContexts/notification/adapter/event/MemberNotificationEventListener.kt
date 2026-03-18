package com.back.boundedContexts.member.subContexts.notification.adapter.event

import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationApplicationService
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener

/**
 * MemberNotificationEventListener는 도메인 이벤트 전파에 사용하는 페이로드입니다.
 * 이벤트 구독자가 필요한 최소 데이터만 안정적으로 전달합니다.
 */
@Component
class MemberNotificationEventListener(
    private val memberNotificationApplicationService: MemberNotificationApplicationService,
) {
    /**
     * 이벤트를 수신해 후속 비동기 처리 작업을 등록합니다.
     * 이벤트 어댑터 계층에서 트랜잭션 경계를 넘는 후속 처리를 안전하게 연결합니다.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun handle(event: PostCommentWrittenEvent) {
        runCatching {
            memberNotificationApplicationService.createForCommentWritten(event)
        }.onFailure { exception ->
            log.warn("Failed to create member notification for post comment event: {}", event.uid, exception)
        }
    }

    companion object {
        private val log = LoggerFactory.getLogger(MemberNotificationEventListener::class.java)
    }
}
