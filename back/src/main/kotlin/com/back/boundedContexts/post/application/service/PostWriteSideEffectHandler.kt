package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.event.PostModifiedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.global.event.application.EventPublisher
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.task.annotation.TaskHandler
import com.back.standard.dto.EventPayload
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.ObjectMapper
import kotlin.jvm.optionals.getOrNull

@Component
class PostWriteSideEffectHandler(
    private val postReadCacheInvalidator: PostReadCacheInvalidator,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
    private val postRecommendFeatureStoreService: PostRecommendFeatureStoreService,
    private val postRepository: PostRepositoryPort,
    private val postAttrRepository: PostAttrRepositoryPort,
    private val eventPublisher: EventPublisher,
    private val objectMapper: ObjectMapper,
    transactionManager: PlatformTransactionManager,
) {
    private val logger = LoggerFactory.getLogger(PostWriteSideEffectHandler::class.java)
    private val afterCommitSideEffectTransactionTemplate =
        TransactionTemplate(transactionManager).apply {
            propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
        }

    @TaskHandler
    fun handle(payload: PostWriteSideEffectPayload) {
        val failures =
            handle(
                postId = payload.postId,
                attachmentKeys = payload.attachmentKeys,
                beforeTags = payload.beforeTags,
                afterTags = payload.afterTags,
                cacheInvalidationScope = PostReadCacheInvalidationScope.fromTargets(payload.cacheInvalidationTargets),
                evictReason = payload.evictReason,
                recommendationAction = payload.recommendationAction,
            ).toMutableList()
        payload.toDomainEvent()?.let { domainEvent ->
            runAfterCommitSideEffectInNewTransaction(
                postId = payload.postId,
                failureMessage = "Failed to publish post write domain event after commit",
            ) {
                eventPublisher.publish(domainEvent)
            }?.let(failures::add)
        }
        if (failures.isNotEmpty()) throwForTaskRetry(failures)
    }

    internal fun handle(event: PostWriteAfterCommitEvent) {
        val command = event.command
        val failures =
            handle(
                postId = command.postId,
                attachmentKeys =
                    PostAttachmentObjectKeySnapshot.fromContents(
                        command.previousContent,
                        command.currentContent,
                        command.deletedContent,
                    ),
                beforeTags = command.beforeTags,
                afterTags = command.afterTags,
                cacheInvalidationScope = command.cacheInvalidationScope,
                evictReason = command.evictReason,
                recommendationAction = command.recommendationAction,
            ).toMutableList()
        event.domainEvent?.let { domainEvent ->
            runAfterCommitSideEffectInNewTransaction(
                postId = event.command.postId,
                failureMessage = "Failed to publish post write domain event after commit",
            ) {
                eventPublisher.publish(domainEvent)
            }?.let(failures::add)
        }
        if (failures.isNotEmpty()) throwForTaskRetry(failures)
    }

    private fun handle(
        postId: Long,
        attachmentKeys: PostAttachmentObjectKeySnapshot,
        beforeTags: List<String>,
        afterTags: List<String>,
        cacheInvalidationScope: PostReadCacheInvalidationScope,
        evictReason: String,
        recommendationAction: PostRecommendationSideEffect,
    ): List<Throwable> {
        val failures = mutableListOf<Throwable>()

        runCatching {
            postReadCacheInvalidator.invalidate(
                PostReadCacheInvalidationRequest(
                    postId = postId,
                    beforeTags = beforeTags,
                    afterTags = afterTags,
                    scope = cacheInvalidationScope,
                    evictReason = evictReason,
                ),
            ) {}
        }.onFailure { exception ->
            logger.warn("Failed to evict post read caches after commit: postId={}", postId, exception)
            failures += exception
        }

        when (attachmentKeys.action) {
            PostAttachmentTaskAction.NONE -> Unit
            PostAttachmentTaskAction.SYNC ->
                runAfterCommitSideEffectInNewTransaction(
                    postId = postId,
                    failureMessage = "Failed to sync post attachments after commit",
                ) {
                    uploadedFileRetentionService.syncPostAttachmentKeys(
                        postId = postId,
                        currentImageObjectKeys = attachmentKeys.currentImageObjectKeys,
                        previousImageObjectKeys = attachmentKeys.previousImageObjectKeys,
                        currentFileObjectKeys = attachmentKeys.currentFileObjectKeys,
                        previousFileObjectKeys = attachmentKeys.previousFileObjectKeys,
                    )
                }?.let(failures::add)
            PostAttachmentTaskAction.DELETE ->
                runAfterCommitSideEffectInNewTransaction(
                    postId = postId,
                    failureMessage = "Failed to schedule cleanup for deleted post after commit",
                ) {
                    uploadedFileRetentionService.scheduleDeletedPostAttachmentKeys(
                        attachmentKeys.deletedImageObjectKeys,
                        attachmentKeys.deletedFileObjectKeys,
                    )
                }?.let(failures::add)
        }

        when (recommendationAction) {
            PostRecommendationSideEffect.REFRESH ->
                runAfterCommitSideEffectInNewTransaction(
                    postId = postId,
                    failureMessage = "Failed to refresh recommend feature store after commit",
                ) {
                    refreshRecommendFeatureStoreAfterCommit(postId)
                }?.let(failures::add)

            PostRecommendationSideEffect.EVICT ->
                runAfterCommitSideEffectInNewTransaction(
                    postId = postId,
                    failureMessage = "Failed to evict recommend feature store after commit",
                ) {
                    postRecommendFeatureStoreService.evict(postId)
                }?.let(failures::add)

            PostRecommendationSideEffect.NONE -> Unit
        }

        return failures
    }

    private fun runAfterCommitSideEffectInNewTransaction(
        postId: Long,
        failureMessage: String,
        block: () -> Unit,
    ): Throwable? {
        runCatching {
            afterCommitSideEffectTransactionTemplate.executeWithoutResult {
                block()
            }
        }.onFailure { exception ->
            logger.warn("{}: postId={}", failureMessage, postId, exception)
            return exception
        }
        return null
    }

    private fun refreshRecommendFeatureStoreAfterCommit(postId: Long) {
        val post =
            postRepository.findById(postId).getOrNull()
                ?: error("Cannot refresh recommendation features for missing postId=$postId")
        hydratePostAttrs(post)
        postRecommendFeatureStoreService.refresh(post)
    }

    private fun hydratePostAttrs(post: Post) {
        post.likesCountAttr ?: postAttrRepository.findBySubjectAndName(post, LIKES_COUNT)?.let { post.likesCountAttr = it }
        post.hitCountAttr ?: postAttrRepository.findBySubjectAndName(post, HIT_COUNT)?.let { post.hitCountAttr = it }
    }

    private fun PostWriteSideEffectPayload.toDomainEvent(): EventPayload? {
        if (domainEventType == null && domainEventJson == null) return null
        val eventType = requireNotNull(domainEventType) { "Post write domain event type is required" }
        val eventJson = requireNotNull(domainEventJson) { "Post write domain event payload is required" }
        return when (eventType) {
            PostWrittenEvent::class.java.name -> objectMapper.readValue(eventJson, PostWrittenEvent::class.java)
            PostModifiedEvent::class.java.name -> objectMapper.readValue(eventJson, PostModifiedEvent::class.java)
            PostDeletedEvent::class.java.name -> objectMapper.readValue(eventJson, PostDeletedEvent::class.java)
            else -> error("Unsupported post write domain event type=$eventType")
        }
    }

    private fun throwForTaskRetry(failures: List<Throwable>) {
        val first = failures.first()
        failures.drop(1).forEach(first::addSuppressed)
        if (first is RuntimeException) throw first
        throw IllegalStateException("Post write side effect failed", first)
    }
}
