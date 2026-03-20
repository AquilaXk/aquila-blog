package com.back.global.revalidate.adapter.event

import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.event.PostModifiedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.global.revalidate.dto.RevalidateHomePayload
import com.back.global.task.annotation.TaskHandler
import com.back.global.task.application.TaskFacade
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener
import java.util.UUID

/**
 * RevalidateEventListener는 도메인 이벤트를 수신해 후속 처리를 연결하는 이벤트 어댑터입니다.
 * 이벤트 수신 시 비동기 작업 등록과 재처리 경로를 담당합니다.
 */
@Component
class RevalidateEventListener(
    private val taskFacade: TaskFacade,
    private val revalidateService: com.back.global.revalidate.RevalidateService,
) {
    // revalidate 큐 적재 실패가 본 요청 트랜잭션을 깨지 않도록 AFTER_COMMIT에서 처리한다.
    @TransactionalEventListener(
        phase = TransactionPhase.AFTER_COMMIT,
        fallbackExecution = true,
    )
    fun handle(event: PostWrittenEvent) = enqueueHomeRevalidate(event.aggregateType, event.aggregateId)

    @TransactionalEventListener(
        phase = TransactionPhase.AFTER_COMMIT,
        fallbackExecution = true,
    )
    fun handle(event: PostModifiedEvent) = enqueueHomeRevalidate(event.aggregateType, event.aggregateId)

    @TransactionalEventListener(
        phase = TransactionPhase.AFTER_COMMIT,
        fallbackExecution = true,
    )
    fun handle(event: PostDeletedEvent) = enqueueHomeRevalidate(event.aggregateType, event.aggregateId)

    @TaskHandler
    fun handle(payload: RevalidateHomePayload) {
        revalidateService.revalidatePath(payload.path)
    }

    /**
     * enqueueHomeRevalidate 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 어댑터 계층에서 외부 시스템 연동 오류를 캡슐화해 상위 계층 영향을 최소화합니다.
     */
    private fun enqueueHomeRevalidate(
        aggregateType: String,
        aggregateId: Long,
    ) {
        runCatching {
            taskFacade.addToQueue(
                RevalidateHomePayload(
                    uid = UUID.randomUUID(),
                    aggregateType = aggregateType,
                    aggregateId = aggregateId,
                ),
            )
        }.onFailure { exception ->
            log.warn(
                "Failed to enqueue revalidate task: aggregate={}:{}",
                aggregateType,
                aggregateId,
                exception,
            )
        }
    }

    companion object {
        private val log = LoggerFactory.getLogger(RevalidateEventListener::class.java)
    }
}
