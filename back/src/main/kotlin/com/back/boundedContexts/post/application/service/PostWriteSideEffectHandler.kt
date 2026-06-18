package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.postMixin.COMMENTS_COUNT
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.global.event.application.EventPublisher
import com.back.global.storage.application.UploadedFileRetentionService
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener
import org.springframework.transaction.support.TransactionTemplate
import kotlin.jvm.optionals.getOrNull

@Component
class PostWriteSideEffectHandler(
    private val postReadCacheInvalidator: PostReadCacheInvalidator,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
    private val postRecommendFeatureStoreService: PostRecommendFeatureStoreService,
    private val postRepository: PostRepositoryPort,
    private val postAttrRepository: PostAttrRepositoryPort,
    private val eventPublisher: EventPublisher,
    transactionManager: PlatformTransactionManager,
) {
    private val logger = LoggerFactory.getLogger(PostWriteSideEffectHandler::class.java)
    private val afterCommitSideEffectTransactionTemplate =
        TransactionTemplate(transactionManager).apply {
            propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
        }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
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

    private fun handle(command: PostWriteSideEffectCommand) {
        runCatching {
            postReadCacheInvalidator.invalidate(command.toCacheInvalidationRequest()) {}
        }.onFailure { exception ->
            logger.warn("Failed to evict post read caches after commit: postId={}", command.postId, exception)
        }

        command.currentContent?.let { currentContent ->
            runAfterCommitSideEffectInNewTransaction(
                postId = command.postId,
                failureMessage = "Failed to sync post attachments after commit",
            ) {
                uploadedFileRetentionService.syncPostContent(command.postId, command.previousContent, currentContent)
            }
        }

        command.deletedContent?.let { deletedContent ->
            runAfterCommitSideEffectInNewTransaction(
                postId = command.postId,
                failureMessage = "Failed to schedule cleanup for deleted post after commit",
            ) {
                uploadedFileRetentionService.scheduleDeletedPostAttachments(deletedContent)
            }
        }

        when (command.recommendationAction) {
            PostRecommendationSideEffect.REFRESH ->
                runAfterCommitSideEffectInNewTransaction(
                    postId = command.postId,
                    failureMessage = "Failed to refresh recommend feature store after commit",
                ) {
                    refreshRecommendFeatureStoreAfterCommit(command.postId)
                }

            PostRecommendationSideEffect.EVICT ->
                runAfterCommitSideEffectInNewTransaction(
                    postId = command.postId,
                    failureMessage = "Failed to evict recommend feature store after commit",
                ) {
                    postRecommendFeatureStoreService.evict(command.postId)
                }
        }
    }

    private fun runAfterCommitSideEffectInNewTransaction(
        postId: Long,
        failureMessage: String,
        block: () -> Unit,
    ) {
        runCatching {
            afterCommitSideEffectTransactionTemplate.executeWithoutResult {
                block()
            }
        }.onFailure { exception ->
            logger.warn("{}: postId={}", failureMessage, postId, exception)
        }
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
            evictHotReadPages = evictHotReadPages,
            evictSearchFirstPage = evictSearchFirstPage,
            evictImpactedTagPages = evictImpactedTagPages,
            evictTagsPublic = evictTagsPublic,
            evictDetail = evictDetail,
            evictReason = evictReason,
        )
}
