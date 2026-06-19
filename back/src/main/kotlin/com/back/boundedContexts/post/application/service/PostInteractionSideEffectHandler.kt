package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.postMixin.COMMENTS_COUNT
import com.back.boundedContexts.post.domain.postMixin.HIT_COUNT
import com.back.boundedContexts.post.domain.postMixin.LIKES_COUNT
import com.back.boundedContexts.post.event.PostCommentDeletedEvent
import com.back.boundedContexts.post.event.PostCommentModifiedEvent
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import com.back.boundedContexts.post.event.PostLikedEvent
import com.back.boundedContexts.post.event.PostUnlikedEvent
import com.back.global.event.application.EventPublisher
import com.back.global.task.annotation.TaskHandler
import com.back.standard.dto.EventPayload
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import kotlin.jvm.optionals.getOrNull

@Component
class PostInteractionSideEffectHandler(
    private val postRecommendFeatureStoreService: PostRecommendFeatureStoreService,
    private val postRepository: PostRepositoryPort,
    private val postAttrRepository: PostAttrRepositoryPort,
    private val eventPublisher: EventPublisher,
    transactionManager: PlatformTransactionManager,
) {
    private val logger = LoggerFactory.getLogger(PostInteractionSideEffectHandler::class.java)
    private val sideEffectTransactionTemplate =
        TransactionTemplate(transactionManager).apply {
            propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
        }

    @TaskHandler
    fun handle(payload: PostInteractionSideEffectPayload) {
        val failures = mutableListOf<Throwable>()

        when (payload.recommendationAction) {
            PostInteractionRecommendationSideEffect.NONE -> Unit
            PostInteractionRecommendationSideEffect.REFRESH ->
                runSideEffectInNewTransaction(
                    postId = payload.postId,
                    failureMessage = "Failed to refresh recommend feature store after interaction commit",
                ) {
                    refreshRecommendFeatureStoreIfPublic(payload.postId)
                }?.let(failures::add)
        }

        if (failures.isNotEmpty()) throwForTaskRetry(failures)

        payload.toDomainEvent()?.let { domainEvent ->
            runSideEffectInNewTransaction(
                postId = payload.postId,
                failureMessage = "Failed to publish post interaction domain event after commit",
            ) {
                eventPublisher.publish(domainEvent)
            }?.let(failures::add)
        }

        if (failures.isNotEmpty()) throwForTaskRetry(failures)
    }

    private fun runSideEffectInNewTransaction(
        postId: Long,
        failureMessage: String,
        block: () -> Unit,
    ): Throwable? {
        runCatching {
            sideEffectTransactionTemplate.executeWithoutResult {
                block()
            }
        }.onFailure { exception ->
            logger.warn("{}: postId={}", failureMessage, postId, exception)
            return exception
        }
        return null
    }

    private fun refreshRecommendFeatureStoreIfPublic(postId: Long) {
        val post =
            postRepository.findById(postId).getOrNull()
                ?: run {
                    logger.warn("interaction_recommend_feature_store_refresh_skipped_missing_post postId={}", postId)
                    return
                }
        if (!post.published || !post.listed) return
        hydratePostAttrs(post)
        postRecommendFeatureStoreService.refresh(post)
    }

    private fun hydratePostAttrs(post: Post) {
        post.likesCountAttr ?: postAttrRepository.findBySubjectAndName(post, LIKES_COUNT)?.let { post.likesCountAttr = it }
        post.commentsCountAttr ?: postAttrRepository.findBySubjectAndName(post, COMMENTS_COUNT)?.let { post.commentsCountAttr = it }
        post.hitCountAttr ?: postAttrRepository.findBySubjectAndName(post, HIT_COUNT)?.let { post.hitCountAttr = it }
    }

    private fun PostInteractionSideEffectPayload.toDomainEvent(): EventPayload? {
        val eventType = domainEventType ?: return null
        val eventUid = domainEventUid ?: return null
        return when (eventType) {
            PostCommentWrittenEvent::class.java.name ->
                PostCommentWrittenEvent(
                    eventUid,
                    requireNotNull(postCommentDto),
                    requireNotNull(postDto),
                    requireNotNull(actorDto),
                    replyReceiverId,
                )
            PostCommentModifiedEvent::class.java.name ->
                PostCommentModifiedEvent(
                    eventUid,
                    requireNotNull(postCommentDto),
                    requireNotNull(postDto),
                    requireNotNull(actorDto),
                )
            PostCommentDeletedEvent::class.java.name ->
                PostCommentDeletedEvent(
                    eventUid,
                    requireNotNull(postCommentDto),
                    requireNotNull(postDto),
                    requireNotNull(actorDto),
                )
            PostLikedEvent::class.java.name ->
                PostLikedEvent(
                    eventUid,
                    postId,
                    requireNotNull(postAuthorId),
                    requireNotNull(likeId),
                    requireNotNull(actorDto),
                )
            PostUnlikedEvent::class.java.name ->
                PostUnlikedEvent(
                    eventUid,
                    postId,
                    requireNotNull(postAuthorId),
                    requireNotNull(likeId),
                    requireNotNull(actorDto),
                )
            else -> {
                logger.warn("post_interaction_side_effect_unknown_domain_event_type type={}", eventType)
                null
            }
        }
    }

    private fun throwForTaskRetry(failures: List<Throwable>) {
        val first = failures.first()
        failures.drop(1).forEach(first::addSuppressed)
        if (first is RuntimeException) throw first
        throw IllegalStateException("Post interaction side effect failed", first)
    }
}
