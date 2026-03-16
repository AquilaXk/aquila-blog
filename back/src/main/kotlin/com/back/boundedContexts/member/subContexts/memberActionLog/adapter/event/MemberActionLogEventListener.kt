package com.back.boundedContexts.member.subContexts.memberActionLog.adapter.event

import com.back.boundedContexts.member.subContexts.memberActionLog.application.service.MemberActionLogApplicationService
import com.back.boundedContexts.member.subContexts.memberActionLog.dto.MemberCreateActionLogPayload
import com.back.boundedContexts.post.event.*
import com.back.global.task.annotation.TaskHandler
import com.back.global.task.application.TaskFacade
import com.back.standard.dto.EventPayload
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener

@Component
class MemberActionLogEventListener(
    private val memberActionLogApplicationService: MemberActionLogApplicationService,
    private val taskFacade: TaskFacade,
) {
    // 액션로그 큐 적재 실패가 사용자 요청 트랜잭션을 깨지 않도록 AFTER_COMMIT에서 처리한다.
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun handle(event: PostWrittenEvent) = addTask(event)

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun handle(event: PostModifiedEvent) = addTask(event)

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun handle(event: PostDeletedEvent) = addTask(event)

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun handle(event: PostCommentWrittenEvent) = addTask(event)

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun handle(event: PostCommentModifiedEvent) = addTask(event)

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun handle(event: PostCommentDeletedEvent) = addTask(event)

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun handle(event: PostLikedEvent) = addTask(event)

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun handle(event: PostUnlikedEvent) = addTask(event)

    private fun addTask(event: EventPayload) {
        runCatching {
            taskFacade.addToQueue(MemberCreateActionLogPayload(event.uid, event.aggregateType, event.aggregateId, event))
        }.onFailure { exception ->
            log.warn(
                "Failed to enqueue member action log task: uid={}, aggregate={}:{}, type={}",
                event.uid,
                event.aggregateType,
                event.aggregateId,
                event::class.simpleName ?: "unknown",
                exception,
            )
        }
    }

    // 실제 로그 저장은 TaskHandler에서 처리해 write API latency에 직접 영향이 없도록 분리한다.
    @TaskHandler
    fun handle(payload: MemberCreateActionLogPayload) {
        memberActionLogApplicationService.save(payload.event)
    }

    companion object {
        private val log = LoggerFactory.getLogger(MemberActionLogEventListener::class.java)
    }
}
