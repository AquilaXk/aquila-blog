package com.back.boundedContexts.member.subContexts.notification.adapter.`in`.event

import com.back.boundedContexts.member.subContexts.notification.application.service.MemberNotificationApplicationService
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener

@Component
class MemberNotificationEventListener(
    private val memberNotificationApplicationService: MemberNotificationApplicationService,
) {
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
