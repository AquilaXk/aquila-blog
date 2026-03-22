package com.back.boundedContexts.post.adapter.event

import com.back.boundedContexts.post.application.service.PostReadPrewarmService
import com.back.boundedContexts.post.application.service.PostSearchIndexSyncService
import com.back.boundedContexts.post.dto.PostReadPrewarmPayload
import com.back.boundedContexts.post.dto.PostSearchIndexSyncPayload
import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.event.PostModifiedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.global.task.annotation.TaskHandler
import com.back.global.task.application.TaskFacade
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener
import java.util.UUID

/**
 * PostReadModelTaskEventListener는 게시글 쓰기 이벤트를 read-model 후속 작업 태스크로 비동기 분리합니다.
 * 검색 인덱스 동기화와 read prewarm을 큐로 격리해 API 쓰기 지연과 장애 전파를 줄입니다.
 */
@Component
class PostReadModelTaskEventListener(
    private val taskFacade: TaskFacade,
    private val postSearchIndexSyncService: PostSearchIndexSyncService,
    private val postReadPrewarmService: PostReadPrewarmService,
    @Value("\${custom.post.search-index.async-sync-enabled:true}")
    private val asyncSearchIndexSyncEnabled: Boolean,
    @Value("\${custom.post.read.prewarm.enabled:true}")
    private val prewarmEnabled: Boolean,
) {
    @TransactionalEventListener(
        phase = TransactionPhase.AFTER_COMMIT,
        fallbackExecution = true,
    )
    fun handle(event: PostWrittenEvent) =
        enqueueFollowupTasks(
            aggregateType = event.aggregateType,
            postId = event.aggregateId,
            beforeTags = event.beforeTags,
            afterTags = event.afterTags,
            forceClearSearchIndex = false,
            warmDetail = event.postDto.published && event.postDto.listed,
        )

    @TransactionalEventListener(
        phase = TransactionPhase.AFTER_COMMIT,
        fallbackExecution = true,
    )
    fun handle(event: PostModifiedEvent) =
        enqueueFollowupTasks(
            aggregateType = event.aggregateType,
            postId = event.aggregateId,
            beforeTags = event.beforeTags,
            afterTags = event.afterTags,
            forceClearSearchIndex = false,
            warmDetail = event.postDto.published && event.postDto.listed,
        )

    @TransactionalEventListener(
        phase = TransactionPhase.AFTER_COMMIT,
        fallbackExecution = true,
    )
    fun handle(event: PostDeletedEvent) =
        enqueueFollowupTasks(
            aggregateType = event.aggregateType,
            postId = event.aggregateId,
            beforeTags = event.beforeTags,
            afterTags = event.afterTags,
            forceClearSearchIndex = true,
            warmDetail = false,
        )

    @TaskHandler
    fun handle(payload: PostSearchIndexSyncPayload) {
        postSearchIndexSyncService.sync(
            postId = payload.postId,
            fallbackTags = payload.fallbackTags,
            forceClear = payload.forceClear,
        )
    }

    @TaskHandler
    fun handle(payload: PostReadPrewarmPayload) {
        postReadPrewarmService.prewarm(
            postId = payload.postId,
            tags = payload.tags,
            warmDetail = payload.warmDetail,
        )
    }

    private fun enqueueFollowupTasks(
        aggregateType: String,
        postId: Long,
        beforeTags: List<String>,
        afterTags: List<String>,
        forceClearSearchIndex: Boolean,
        warmDetail: Boolean,
    ) {
        val mergedTags = mergeTags(beforeTags, afterTags)

        if (asyncSearchIndexSyncEnabled) {
            runCatching {
                taskFacade.addToQueue(
                    PostSearchIndexSyncPayload(
                        uid = UUID.randomUUID(),
                        aggregateType = aggregateType,
                        aggregateId = postId,
                        postId = postId,
                        fallbackTags = afterTags,
                        forceClear = forceClearSearchIndex,
                    ),
                )
            }.onFailure { exception ->
                log.warn("Failed to enqueue post search-index sync task: aggregate={}:{}", aggregateType, postId, exception)
            }
        }

        if (prewarmEnabled) {
            runCatching {
                taskFacade.addToQueue(
                    PostReadPrewarmPayload(
                        uid = UUID.randomUUID(),
                        aggregateType = aggregateType,
                        aggregateId = postId,
                        postId = postId,
                        tags = mergedTags,
                        warmDetail = warmDetail,
                    ),
                )
            }.onFailure { exception ->
                log.warn("Failed to enqueue post read prewarm task: aggregate={}:{}", aggregateType, postId, exception)
            }
        }
    }

    private fun mergeTags(
        beforeTags: List<String>,
        afterTags: List<String>,
    ): List<String> =
        buildList(beforeTags.size + afterTags.size) {
            addAll(beforeTags)
            addAll(afterTags)
        }.asSequence()
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
            .toList()

    companion object {
        private val log = LoggerFactory.getLogger(PostReadModelTaskEventListener::class.java)
    }
}
