package com.back.boundedContexts.member.subContexts.memberActionLog.`in`

import com.back.boundedContexts.member.subContexts.memberActionLog.app.MemberActionLogFacade
import com.back.boundedContexts.member.subContexts.memberActionLog.dto.MemberCreateActionLogPayload
import com.back.boundedContexts.post.event.*
import com.back.global.task.annotation.TaskHandler
import com.back.global.task.app.TaskFacade
import com.back.standard.dto.EventPayload
import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener

@Component
class MemberActionLogEventListener(
    private val memberActionLogFacade: MemberActionLogFacade,
    private val taskFacade: TaskFacade,
) {
    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    fun handle(event: PostWrittenEvent) = addTask(event)

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    fun handle(event: PostModifiedEvent) = addTask(event)

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    fun handle(event: PostDeletedEvent) = addTask(event)

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    fun handle(event: PostCommentWrittenEvent) = addTask(event)

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    fun handle(event: PostCommentModifiedEvent) = addTask(event)

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    fun handle(event: PostCommentDeletedEvent) = addTask(event)

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    fun handle(event: PostLikedEvent) = addTask(event)

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    fun handle(event: PostUnlikedEvent) = addTask(event)

    private fun addTask(event: EventPayload) {
        taskFacade.addToQueue(MemberCreateActionLogPayload(event.uid, event.aggregateType, event.aggregateId, event))
    }

    @TaskHandler
    fun handle(payload: MemberCreateActionLogPayload) {
        memberActionLogFacade.save(payload.event)
    }
}
