package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.application.port.input.PostScheduledPublishUseCase
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRevisionRepositoryPort
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.global.storage.application.UploadedFileUrlCodec
import com.back.global.task.application.TaskFacade
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import tools.jackson.databind.ObjectMapper
import java.nio.charset.StandardCharsets
import java.time.Clock
import java.time.Instant
import java.util.UUID

@Service
class PostScheduledPublishExecutor(
    private val postRepository: PostRepositoryPort,
    private val postTempDraftService: PostTempDraftService,
    private val postTagIndexService: PostTagIndexService,
    private val postHydrationService: PostHydrationService,
    private val taskFacade: TaskFacade,
    private val objectMapper: ObjectMapper,
    private val postReadCacheInvalidator: PostReadCacheInvalidator? = null,
    private val postRevisionRepository: PostRevisionRepositoryPort? = null,
) {
    private val logger = LoggerFactory.getLogger(PostScheduledPublishExecutor::class.java)

    @Transactional
    fun publishDuePost(
        postId: Long,
        now: Instant,
    ): Boolean {
        val post = postRepository.findById(postId).orElse(null) ?: return false
        val scheduledAt = post.scheduledAt ?: return false
        if (post.deletedAt != null || post.published || scheduledAt.isAfter(now)) {
            return false
        }

        postHydrationService.hydratePostAttrs(post)
        postHydrationService.hydrateMembersPublishedProfileWorkspaces(listOf(post.author))
        val wasTempDraft = postTempDraftService.isTempDraft(post)

        post.published = true
        if (wasTempDraft) {
            post.listed = true
        }
        post.isTempDraft = false
        post.scheduledAt = null

        if (wasTempDraft) {
            postTempDraftService.clearTrackedTempDraftIfMatches(post.author, post.id)
        }
        postRepository.flush()

        val afterTags = postTagIndexService.syncPostTags(post)
        val currentAttachmentKeys = UploadedFileUrlCodec.extractPartitionedObjectKeysFromContent(post.content)
        postRepository.syncImageReferences(post.id, currentAttachmentKeys.allKeys())
        postRevisionRepository?.appendAndTrimRevisions(
            postId = post.id,
            authorId = post.author.id,
            title = post.title,
            content = post.content,
            summaryText = post.summaryText,
            maxRevisionsPerPost = MAX_REVISIONS_PER_POST,
        )

        val domainEvent =
            PostWrittenEvent(
                UUID.randomUUID(),
                PostDto(post),
                MemberDto(post.author),
                afterTags,
                emptyList(),
            )
        val command =
            PostWriteSideEffectCommand(
                postId = post.id,
                previousContent = null,
                currentContent = post.content,
                deletedContent = null,
                beforeTags = emptyList(),
                afterTags = afterTags,
                cacheInvalidationScope = PostReadCacheInvalidationScope.PublicPostCreated,
                evictReason = "scheduled-publish",
                recommendationAction = PostRecommendationSideEffect.REFRESH,
                preExtractedCurrentKeys = currentAttachmentKeys,
            )
        val taskUid =
            UUID.nameUUIDFromBytes(
                "${PostWriteSideEffectPayload.TASK_TYPE}:${domainEvent.uid}".toByteArray(StandardCharsets.UTF_8),
            )
        taskFacade.addToQueue(
            PostWriteSideEffectPayload(
                uid = taskUid,
                aggregateType = domainEvent.aggregateType,
                aggregateId = post.id,
                postId = post.id,
                attachmentKeys =
                    PostAttachmentObjectKeySnapshot.fromContents(
                        previousContent = null,
                        currentContent = post.content,
                        deletedContent = null,
                        preExtractedCurrentKeys = currentAttachmentKeys,
                    ),
                beforeTags = emptyList(),
                afterTags = afterTags,
                cacheInvalidationTargets = command.cacheInvalidationScope.targets(),
                evictReason = command.evictReason,
                recommendationAction = command.recommendationAction,
                domainEventType = domainEvent.javaClass.name,
                domainEventJson = objectMapper.writeValueAsString(domainEvent),
            ),
        )
        invalidateCacheAfterCommit(post.id, afterTags)
        logger.info("scheduled_post_published postId={} scheduledAt={}", post.id, scheduledAt)
        return true
    }

    private fun invalidateCacheAfterCommit(
        postId: Long,
        afterTags: List<String>,
    ) {
        val invalidator = postReadCacheInvalidator ?: return
        val request =
            PostReadCacheInvalidationRequest(
                postId = postId,
                beforeTags = emptyList(),
                afterTags = afterTags,
                scope = PostReadCacheInvalidationScope.PublicPostCreated,
                evictReason = "scheduled-publish",
            )
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                object : TransactionSynchronization {
                    override fun afterCommit() {
                        runCatching { invalidator.invalidate(request) }
                            .onFailure { logger.warn("Scheduled publish cache invalidation failed for postId={}", postId, it) }
                    }
                },
            )
        } else {
            runCatching { invalidator.invalidate(request) }
                .onFailure { logger.warn("Scheduled publish cache invalidation failed for postId={}", postId, it) }
        }
    }

    companion object {
        private const val MAX_REVISIONS_PER_POST = 20
    }
}

@Service
class PostScheduledPublishService(
    private val postRepository: PostRepositoryPort,
    private val scheduledPublishExecutor: PostScheduledPublishExecutor,
    private val clock: Clock = Clock.systemUTC(),
) : PostScheduledPublishUseCase {
    private val logger = LoggerFactory.getLogger(PostScheduledPublishService::class.java)

    override fun publishDueScheduledPosts(
        now: Instant?,
        batchSize: Int,
    ): Int {
        val effectiveNow = now ?: clock.instant()
        val safeBatch = batchSize.coerceIn(1, 100)
        val dueIds = postRepository.findDueScheduledDraftIds(effectiveNow, safeBatch)
        var publishedCount = 0
        for (postId in dueIds) {
            val ok =
                runCatching { scheduledPublishExecutor.publishDuePost(postId, effectiveNow) }
                    .onFailure { ex ->
                        logger.warn("Failed to publish scheduled post postId={}", postId, ex)
                    }.getOrDefault(false)
            if (ok) publishedCount += 1
        }
        return publishedCount
    }
}
