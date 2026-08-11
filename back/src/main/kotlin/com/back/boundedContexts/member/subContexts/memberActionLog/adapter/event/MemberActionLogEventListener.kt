package com.back.boundedContexts.member.subContexts.memberActionLog.adapter.event

import com.back.boundedContexts.member.subContexts.memberActionLog.application.service.MemberActionLogApplicationService
import com.back.boundedContexts.member.subContexts.memberActionLog.dto.MemberCreateActionLogPayload
import com.back.boundedContexts.post.event.*
import com.back.global.task.annotation.TaskHandler
import com.back.global.task.application.TaskFacade
import com.back.standard.dto.EventPayload
import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener

/**
 * MemberActionLogEventListener는 도메인 이벤트 전파에 사용하는 페이로드입니다.
 * 이벤트 구독자가 필요한 최소 데이터만 안정적으로 전달합니다.
 */
@Component
class MemberActionLogEventListener(
    private val memberActionLogApplicationService: MemberActionLogApplicationService,
    private val taskFacade: TaskFacade,
) {
    // AFTER_COMMIT enqueue 실패는 alternate 실행 없이 event dispatch 실패로 드러낸다.
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

    /**
     * 도메인 이벤트를 작업 큐 태스크로 변환해 비동기 실행을 예약합니다.
     * 이벤트 어댑터 계층에서 트랜잭션 경계를 넘는 후속 처리를 안전하게 연결합니다.
     */
    private fun addTask(event: EventPayload) {
        taskFacade.addToQueue(MemberCreateActionLogPayload(event.uid, event.aggregateType, event.aggregateId, event))
    }

    // 실제 로그 저장은 TaskHandler에서 처리해 write API latency에 직접 영향이 없도록 분리한다.
    @TaskHandler
    fun handle(payload: MemberCreateActionLogPayload) {
        memberActionLogApplicationService.save(payload.event)
    }
}
