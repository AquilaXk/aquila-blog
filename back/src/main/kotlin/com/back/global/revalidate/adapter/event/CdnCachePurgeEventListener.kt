package com.back.global.revalidate.adapter.event

import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.event.PostModifiedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.global.revalidate.CdnCachePurgeService
import com.back.global.revalidate.dto.PurgePostReadCachesPayload
import com.back.global.task.annotation.TaskHandler
import com.back.global.task.application.TaskFacade
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener
import java.util.UUID

/**
 * CdnCachePurgeEventListener는 게시글 쓰기 이벤트를 수신해 CDN cache-tag purge를 비동기로 큐잉합니다.
 */
@Component
class CdnCachePurgeEventListener(
    private val taskFacade: TaskFacade,
    private val cdnCachePurgeService: CdnCachePurgeService,
) {
    @TransactionalEventListener(
        phase = TransactionPhase.AFTER_COMMIT,
        fallbackExecution = true,
    )
    fun handle(event: PostWrittenEvent) =
        enqueue(
            aggregateType = event.aggregateType,
            postId = event.aggregateId,
            beforeTags = event.beforeTags,
            afterTags = event.afterTags,
        )

    @TransactionalEventListener(
        phase = TransactionPhase.AFTER_COMMIT,
        fallbackExecution = true,
    )
    fun handle(event: PostModifiedEvent) =
        enqueue(
            aggregateType = event.aggregateType,
            postId = event.aggregateId,
            beforeTags = event.beforeTags,
            afterTags = event.afterTags,
        )

    @TransactionalEventListener(
        phase = TransactionPhase.AFTER_COMMIT,
        fallbackExecution = true,
    )
    fun handle(event: PostDeletedEvent) =
        enqueue(
            aggregateType = event.aggregateType,
            postId = event.aggregateId,
            beforeTags = event.beforeTags,
            afterTags = event.afterTags,
        )

    @TaskHandler
    fun handle(payload: PurgePostReadCachesPayload) {
        cdnCachePurgeService.purgePostReadCaches(
            postId = payload.postId,
            beforeTags = payload.beforeTags,
            afterTags = payload.afterTags,
        )
    }

    /**
     * enqueue 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * purge 비활성화/큐 등록 실패가 본 트랜잭션 경로를 차단하지 않도록 fail-open으로 유지합니다.
     */
    private fun enqueue(
        aggregateType: String,
        postId: Long,
        beforeTags: List<String>,
        afterTags: List<String>,
    ) {
        if (!cdnCachePurgeService.isEnabled()) return

        runCatching {
            taskFacade.addToQueue(
                PurgePostReadCachesPayload(
                    uid = UUID.randomUUID(),
                    aggregateType = aggregateType,
                    aggregateId = postId,
                    postId = postId,
                    beforeTags = beforeTags,
                    afterTags = afterTags,
                ),
            )
        }.onFailure { exception ->
            log.warn(
                "Failed to enqueue CDN cache purge task: aggregate={}:{}",
                aggregateType,
                postId,
                exception,
            )
        }
    }

    companion object {
        private val log = LoggerFactory.getLogger(CdnCachePurgeEventListener::class.java)
    }
}
