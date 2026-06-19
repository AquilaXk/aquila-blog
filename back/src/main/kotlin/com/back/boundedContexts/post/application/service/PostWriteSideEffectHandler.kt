package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.postMixin.COMMENTS_COUNT
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
        val command = payload.toCommand()
        val failures = handle(command).toMutableList()
        payload.toDomainEvent()?.let { domainEvent ->
            runAfterCommitSideEffectInNewTransaction(
                postId = command.postId,
                failureMessage = "Failed to publish post write domain event after commit",
            ) {
                eventPublisher.publish(domainEvent)
            }?.let(failures::add)
        }
        if (failures.isNotEmpty()) throwForTaskRetry(failures)
    }

    internal fun handle(event: PostWriteAfterCommitEvent) {
        handle(event.command)
        event.domainEvent?.let { domainEvent ->
            runAfterCommitSideEffectInNewTransaction(
                postId = event.command.postId,
                failureMessage = "Failed to publish post write domain event after commit",
            ) {
                eventPublisher.publish(domainEvent)
            }
        }
    }

    private fun handle(command: PostWriteSideEffectCommand): List<Throwable> {
        val failures = mutableListOf<Throwable>()

        runCatching {
            postReadCacheInvalidator.invalidate(command.toCacheInvalidationRequest()) {}
        }.onFailure { exception ->
            logger.warn("Failed to evict post read caches after commit: postId={}", command.postId, exception)
            failures += exception
        }

        command.currentContent?.let { currentContent ->
            runAfterCommitSideEffectInNewTransaction(
                postId = command.postId,
                failureMessage = "Failed to sync post attachments after commit",
            ) {
                uploadedFileRetentionService.syncPostContent(command.postId, command.previousContent, currentContent)
            }?.let(failures::add)
        }

        command.deletedContent?.let { deletedContent ->
            runAfterCommitSideEffectInNewTransaction(
                postId = command.postId,
                failureMessage = "Failed to schedule cleanup for deleted post after commit",
            ) {
                uploadedFileRetentionService.scheduleDeletedPostAttachments(deletedContent)
            }?.let(failures::add)
        }

        when (command.recommendationAction) {
            PostRecommendationSideEffect.REFRESH ->
                runAfterCommitSideEffectInNewTransaction(
                    postId = command.postId,
                    failureMessage = "Failed to refresh recommend feature store after commit",
                ) {
                    refreshRecommendFeatureStoreAfterCommit(command.postId)
                }?.let(failures::add)

            PostRecommendationSideEffect.EVICT ->
                runAfterCommitSideEffectInNewTransaction(
                    postId = command.postId,
                    failureMessage = "Failed to evict recommend feature store after commit",
                ) {
                    postRecommendFeatureStoreService.evict(command.postId)
                }?.let(failures::add)
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
                ?: run {
                    logger.warn("recommend_feature_store_refresh_skipped_missing_post postId={}", postId)
                    return
                }
        hydratePostAttrs(post)
        postRecommendFeatureStoreService.refresh(post)
    }

    private fun hydratePostAttrs(post: Post) {
        post.likesCountAttr ?: postAttrRepository.findBySubjectAndName(post, LIKES_COUNT)?.let { post.likesCountAttr = it }
        post.commentsCountAttr ?: postAttrRepository.findBySubjectAndName(post, COMMENTS_COUNT)?.let { post.commentsCountAttr = it }
        post.hitCountAttr ?: postAttrRepository.findBySubjectAndName(post, HIT_COUNT)?.let { post.hitCountAttr = it }
    }

    private fun PostWriteSideEffectCommand.toCacheInvalidationRequest(): PostReadCacheInvalidationRequest =
        PostReadCacheInvalidationRequest(
            postId = postId,
            beforeTags = beforeTags,
            afterTags = afterTags,
            scope = cacheInvalidationScope,
            evictReason = evictReason,
        )

    private fun PostWriteSideEffectPayload.toCommand(): PostWriteSideEffectCommand =
        PostWriteSideEffectCommand(
            postId = postId,
            previousContent = previousContent,
            currentContent = currentContent,
            deletedContent = deletedContent,
            beforeTags = beforeTags,
            afterTags = afterTags,
            cacheInvalidationScope = PostReadCacheInvalidationScope.fromTargets(cacheInvalidationTargets),
            evictReason = evictReason,
            recommendationAction = recommendationAction,
        )

    private fun PostWriteSideEffectPayload.toDomainEvent(): EventPayload? {
        val eventType = domainEventType ?: return null
        val eventJson = domainEventJson ?: return null
        return when (eventType) {
            PostWrittenEvent::class.java.name -> objectMapper.readValue(eventJson, PostWrittenEvent::class.java)
            PostModifiedEvent::class.java.name -> objectMapper.readValue(eventJson, PostModifiedEvent::class.java)
            PostDeletedEvent::class.java.name -> objectMapper.readValue(eventJson, PostDeletedEvent::class.java)
            else -> {
                logger.warn("post_write_side_effect_unknown_domain_event_type type={}", eventType)
                null
            }
        }
    }

    private fun throwForTaskRetry(failures: List<Throwable>) {
        val first = failures.first()
        failures.drop(1).forEach(first::addSuppressed)
        if (first is RuntimeException) throw first
        throw IllegalStateException("Post write side effect failed", first)
    }
}
