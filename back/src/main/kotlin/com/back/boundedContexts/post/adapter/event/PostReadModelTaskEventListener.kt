package com.back.boundedContexts.post.adapter.event

import com.back.boundedContexts.post.application.service.PostReadPrewarmService
import com.back.boundedContexts.post.application.service.PostSearchEngineMirrorService
import com.back.boundedContexts.post.application.service.PostSearchIndexSyncService
import com.back.boundedContexts.post.dto.PostReadPrewarmPayload
import com.back.boundedContexts.post.dto.PostSearchEngineMirrorPayload
import com.back.boundedContexts.post.dto.PostSearchIndexSyncPayload
import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.event.PostModifiedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.global.task.annotation.TaskHandler
import com.back.global.task.application.TaskFacade
import io.micrometer.core.instrument.MeterRegistry
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * PostReadModelTaskEventListener는 게시글 쓰기 이벤트를 read-model 후속 작업 태스크로 비동기 분리합니다.
 * 검색 인덱스 동기화와 read prewarm을 큐로 격리해 API 쓰기 지연과 장애 전파를 줄입니다.
 */
@Component
class PostReadModelTaskEventListener(
    private val taskFacade: TaskFacade,
    private val postSearchIndexSyncService: PostSearchIndexSyncService,
    private val postSearchEngineMirrorService: PostSearchEngineMirrorService,
    private val postReadPrewarmService: PostReadPrewarmService,
    private val meterRegistry: MeterRegistry? = null,
    @Value("\${custom.post.search-index.async-sync-enabled:true}")
    private val asyncSearchIndexSyncEnabled: Boolean,
    @Value("\${custom.post.search-index.sla.maxLagSeconds:120}")
    private val searchIndexMaxLagSeconds: Long,
    @Value("\${custom.post.search-engine.mirror.enabled:false}")
    private val searchEngineMirrorEnabled: Boolean,
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
        val lagMs = (System.currentTimeMillis() - payload.enqueuedAtEpochMs).coerceAtLeast(0L)
        meterRegistry?.timer("post.search_index.task.lag")?.record(lagMs, TimeUnit.MILLISECONDS)
        if (lagMs > searchIndexMaxLagSeconds.coerceAtLeast(1) * 1_000) {
            log.warn(
                "post_search_index_sync_sla_breached postId={} lagMs={} thresholdSeconds={}",
                payload.postId,
                lagMs,
                searchIndexMaxLagSeconds,
            )
            meterRegistry?.counter("post.search_index.task.sla_breach")?.increment()
        }

        val startedAtNanos = System.nanoTime()
        runCatching {
            postSearchIndexSyncService.sync(
                postId = payload.postId,
                fallbackTags = payload.fallbackTags,
                forceClear = payload.forceClear,
            )
        }.onSuccess {
            meterRegistry?.counter("post.search_index.task.result", "status", "success")?.increment()
            val elapsedMs = (System.nanoTime() - startedAtNanos).coerceAtLeast(0L) / 1_000_000
            meterRegistry?.timer("post.search_index.task.duration")?.record(elapsedMs, TimeUnit.MILLISECONDS)
        }.onFailure { exception ->
            meterRegistry?.counter("post.search_index.task.result", "status", "failed")?.increment()
            throw exception
        }.getOrThrow()
    }

    @TaskHandler
    fun handle(payload: PostReadPrewarmPayload) {
        postReadPrewarmService.prewarm(
            postId = payload.postId,
            tags = payload.tags,
            warmDetail = payload.warmDetail,
        )
    }

    @TaskHandler
    fun handle(payload: PostSearchEngineMirrorPayload) {
        val lagMs = (System.currentTimeMillis() - payload.enqueuedAtEpochMs).coerceAtLeast(0L)
        meterRegistry?.timer("post.search_engine.mirror.task.lag")?.record(lagMs, TimeUnit.MILLISECONDS)
        postSearchEngineMirrorService.mirror(
            postId = payload.postId,
            tags = payload.tags,
            deleted = payload.deleted,
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
        val normalizedAfterTags = normalizeTags(afterTags)

        if (asyncSearchIndexSyncEnabled) {
            enqueueTask("post.search-index.sync", aggregateType, postId) {
                taskFacade.addToQueue(
                    PostSearchIndexSyncPayload(
                        uid = UUID.randomUUID(),
                        aggregateType = aggregateType,
                        aggregateId = postId,
                        postId = postId,
                        fallbackTags = afterTags,
                        forceClear = forceClearSearchIndex,
                        enqueuedAtEpochMs = System.currentTimeMillis(),
                    ),
                )
            }
        }

        if (searchEngineMirrorEnabled) {
            enqueueTask("post.search-engine.mirror", aggregateType, postId) {
                taskFacade.addToQueue(
                    PostSearchEngineMirrorPayload(
                        uid = UUID.randomUUID(),
                        aggregateType = aggregateType,
                        aggregateId = postId,
                        postId = postId,
                        tags = if (forceClearSearchIndex) beforeTags else afterTags,
                        deleted = forceClearSearchIndex,
                        enqueuedAtEpochMs = System.currentTimeMillis(),
                    ),
                )
            }
        }

        if (prewarmEnabled && warmDetail) {
            enqueueTask("post.read.prewarm", aggregateType, postId) {
                taskFacade.addToQueue(
                    PostReadPrewarmPayload(
                        uid = UUID.randomUUID(),
                        aggregateType = aggregateType,
                        aggregateId = postId,
                        postId = postId,
                        tags = normalizedAfterTags,
                        warmDetail = warmDetail,
                    ),
                )
            }
        }
    }

    private fun enqueueTask(
        taskType: String,
        aggregateType: String,
        postId: Long,
        enqueueAction: () -> Unit,
    ) {
        runCatching(enqueueAction)
            .onSuccess {
                meterRegistry?.counter("task.processor.enqueue.result", "taskType", taskType, "status", "success")?.increment()
            }.onFailure { exception ->
                meterRegistry?.counter("task.processor.enqueue.result", "taskType", taskType, "status", "failed")?.increment()
                log.warn("Failed to enqueue task: taskType={} aggregate={}:{}", taskType, aggregateType, postId, exception)
            }
    }

    private fun normalizeTags(tags: List<String>): List<String> =
        tags
            .asSequence()
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
            .toList()

    companion object {
        private val log = LoggerFactory.getLogger(PostReadModelTaskEventListener::class.java)
    }
}
