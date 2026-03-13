package com.back.global.revalidate.`in`

import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.event.PostModifiedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.global.revalidate.dto.RevalidateHomePayload
import com.back.global.task.annotation.TaskHandler
import com.back.global.task.app.TaskFacade
import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener
import java.util.UUID

@Component
class RevalidateEventListener(
    private val taskFacade: TaskFacade,
    private val revalidateService: com.back.global.revalidate.RevalidateService,
) {
    // 게시글 변경과 revalidate task 적재를 같은 트랜잭션 경계에서 보장하기 위해 BEFORE_COMMIT에서 수집한다.
    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    fun handle(event: PostWrittenEvent) = enqueueHomeRevalidate(event.aggregateType, event.aggregateId)

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    fun handle(event: PostModifiedEvent) = enqueueHomeRevalidate(event.aggregateType, event.aggregateId)

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    fun handle(event: PostDeletedEvent) = enqueueHomeRevalidate(event.aggregateType, event.aggregateId)

    @TaskHandler
    fun handle(payload: RevalidateHomePayload) {
        revalidateService.revalidatePath(payload.path)
    }

    private fun enqueueHomeRevalidate(
        aggregateType: String,
        aggregateId: Int,
    ) {
        taskFacade.addToQueue(
            RevalidateHomePayload(
                uid = UUID.randomUUID(),
                aggregateType = aggregateType,
                aggregateId = aggregateId,
            ),
        )
    }
}
