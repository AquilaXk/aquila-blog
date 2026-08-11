package com.back.boundedContexts.post.application.service

import com.back.global.storage.application.UploadedFileUrlCodec
import com.back.global.task.annotation.Task
import com.back.global.task.annotation.TaskPayloadSensitivity
import com.back.standard.dto.LegacyTaskPayload
import com.back.standard.dto.TaskPayload
import java.util.UUID

@Task(
    type = PostWriteSideEffectPayload.TASK_TYPE,
    schemaVersion = 2,
    sensitivity = TaskPayloadSensitivity.PERSONAL,
    legacyPayloadClass = PostWriteSideEffectPayloadV1::class,
    label = "게시글 쓰기 후속 작업",
    maxRetries = 5,
    baseDelaySeconds = 10,
    backoffMultiplier = 2.0,
    maxDelaySeconds = 300,
)
data class PostWriteSideEffectPayload(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Long,
    val postId: Long,
    val attachmentKeys: PostAttachmentObjectKeySnapshot,
    val beforeTags: List<String>,
    val afterTags: List<String>,
    val cacheInvalidationTargets: Set<PostReadCacheInvalidationTarget>,
    val evictReason: String,
    val recommendationAction: PostRecommendationSideEffect,
    val domainEventType: String?,
    val domainEventJson: String?,
) : TaskPayload {
    companion object {
        const val TASK_TYPE = "post.write.side-effect"
    }
}

data class PostWriteSideEffectPayloadV1(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Long,
    val postId: Long,
    val previousContent: String?,
    val currentContent: String?,
    val deletedContent: String?,
    val beforeTags: List<String>,
    val afterTags: List<String>,
    val cacheInvalidationTargets: Set<PostReadCacheInvalidationTarget>,
    val evictReason: String,
    val recommendationAction: PostRecommendationSideEffect,
    val domainEventType: String?,
    val domainEventJson: String?,
) : LegacyTaskPayload {
    override fun toCurrentTaskPayload(): TaskPayload =
        PostWriteSideEffectPayload(
            uid = uid,
            aggregateType = aggregateType,
            aggregateId = aggregateId,
            postId = postId,
            attachmentKeys = PostAttachmentObjectKeySnapshot.fromContents(previousContent, currentContent, deletedContent),
            beforeTags = beforeTags,
            afterTags = afterTags,
            cacheInvalidationTargets = cacheInvalidationTargets,
            evictReason = evictReason,
            recommendationAction = recommendationAction,
            domainEventType = domainEventType,
            domainEventJson = domainEventJson,
        )
}

enum class PostAttachmentTaskAction {
    NONE,
    SYNC,
    DELETE,
}

data class PostAttachmentObjectKeySnapshot(
    val action: PostAttachmentTaskAction,
    val currentImageObjectKeys: List<String>,
    val previousImageObjectKeys: List<String>,
    val currentFileObjectKeys: List<String>,
    val previousFileObjectKeys: List<String>,
    val deletedImageObjectKeys: List<String>,
    val deletedFileObjectKeys: List<String>,
) {
    companion object {
        fun fromContents(
            previousContent: String?,
            currentContent: String?,
            deletedContent: String?,
        ): PostAttachmentObjectKeySnapshot {
            check(currentContent == null || deletedContent == null) {
                "Post attachment task cannot sync and delete in one payload"
            }
            return PostAttachmentObjectKeySnapshot(
                action =
                    when {
                        currentContent != null -> PostAttachmentTaskAction.SYNC
                        deletedContent != null -> PostAttachmentTaskAction.DELETE
                        else -> PostAttachmentTaskAction.NONE
                    },
                currentImageObjectKeys = extractImageKeys(currentContent),
                previousImageObjectKeys = extractImageKeys(previousContent),
                currentFileObjectKeys = extractFileKeys(currentContent),
                previousFileObjectKeys = extractFileKeys(previousContent),
                deletedImageObjectKeys = extractImageKeys(deletedContent),
                deletedFileObjectKeys = extractFileKeys(deletedContent),
            )
        }

        private fun extractImageKeys(content: String?): List<String> =
            content?.let(UploadedFileUrlCodec::extractImageObjectKeysFromContent)?.sorted().orEmpty()

        private fun extractFileKeys(content: String?): List<String> =
            content?.let(UploadedFileUrlCodec::extractFileObjectKeysFromContent)?.sorted().orEmpty()
    }
}

internal data class PostWriteSideEffectCommand(
    val postId: Long,
    val previousContent: String?,
    val currentContent: String?,
    val deletedContent: String?,
    val beforeTags: List<String>,
    val afterTags: List<String>,
    val cacheInvalidationScope: PostReadCacheInvalidationScope,
    val evictReason: String,
    val recommendationAction: PostRecommendationSideEffect,
    val operationUid: UUID = UUID.randomUUID(),
)

enum class PostRecommendationSideEffect {
    REFRESH,
    EVICT,
    NONE,
}

enum class PostReadCacheInvalidationTarget {
    ADMIN_POSTS_FIRST_PAGE,
    HOT_READ_PAGES,
    SEARCH_FIRST_PAGE,
    IMPACTED_TAG_PAGES,
    PUBLIC_TAGS,
    DETAIL,
}

internal enum class PostPublicChangeImpact {
    LISTING_VISIBILITY,
    TITLE,
    CONTENT,
    TAG,
    SUMMARY,
}

internal sealed class PostReadCacheInvalidationScope(
    private val targetSet: Set<PostReadCacheInvalidationTarget>,
) {
    data object None : PostReadCacheInvalidationScope(emptySet())

    data object PublicPostCreated : PostReadCacheInvalidationScope(ALL_PUBLIC_READ_TARGETS)

    data object PublicPostDeleted : PostReadCacheInvalidationScope(ALL_PUBLIC_READ_TARGETS)

    data object PublicPostRestored : PostReadCacheInvalidationScope(ALL_PUBLIC_READ_TARGETS)

    data object PublicPostHardDeleted : PostReadCacheInvalidationScope(ALL_PUBLIC_READ_TARGETS)

    data object DetailOnly : PostReadCacheInvalidationScope(setOf(PostReadCacheInvalidationTarget.DETAIL))

    data object AdminPostListOnly : PostReadCacheInvalidationScope(setOf(PostReadCacheInvalidationTarget.ADMIN_POSTS_FIRST_PAGE))

    class PublicPostModified(
        impacts: Set<PostPublicChangeImpact>,
    ) : PostReadCacheInvalidationScope(targetsForModifiedPublicPost(impacts))

    private class Explicit(
        targets: Set<PostReadCacheInvalidationTarget>,
    ) : PostReadCacheInvalidationScope(targets)

    fun targets(): Set<PostReadCacheInvalidationTarget> = targetSet

    fun evicts(target: PostReadCacheInvalidationTarget): Boolean = target in targetSet

    fun evictsPublicTags(): Boolean = evicts(PostReadCacheInvalidationTarget.PUBLIC_TAGS)

    fun isEmpty(): Boolean = targetSet.isEmpty()

    companion object {
        private val ALL_PUBLIC_READ_TARGETS = PostReadCacheInvalidationTarget.entries.toSet()

        fun fromTargets(targets: Set<PostReadCacheInvalidationTarget>): PostReadCacheInvalidationScope =
            if (targets.isEmpty()) {
                None
            } else {
                Explicit(targets)
            }

        private fun targetsForModifiedPublicPost(impacts: Set<PostPublicChangeImpact>): Set<PostReadCacheInvalidationTarget> =
            buildSet {
                add(PostReadCacheInvalidationTarget.ADMIN_POSTS_FIRST_PAGE)
                add(PostReadCacheInvalidationTarget.HOT_READ_PAGES)
                if (
                    impacts.any {
                        it == PostPublicChangeImpact.LISTING_VISIBILITY ||
                            it == PostPublicChangeImpact.TITLE ||
                            it == PostPublicChangeImpact.CONTENT ||
                            it == PostPublicChangeImpact.TAG ||
                            it == PostPublicChangeImpact.SUMMARY
                    }
                ) {
                    add(PostReadCacheInvalidationTarget.SEARCH_FIRST_PAGE)
                }
                if (
                    impacts.any {
                        it == PostPublicChangeImpact.LISTING_VISIBILITY ||
                            it == PostPublicChangeImpact.TAG ||
                            it == PostPublicChangeImpact.SUMMARY
                    }
                ) {
                    add(PostReadCacheInvalidationTarget.IMPACTED_TAG_PAGES)
                }
                if (
                    impacts.any {
                        it == PostPublicChangeImpact.LISTING_VISIBILITY ||
                            it == PostPublicChangeImpact.TAG
                    }
                ) {
                    add(PostReadCacheInvalidationTarget.PUBLIC_TAGS)
                }
                if (
                    impacts.any {
                        it == PostPublicChangeImpact.LISTING_VISIBILITY ||
                            it == PostPublicChangeImpact.TITLE ||
                            it == PostPublicChangeImpact.CONTENT ||
                            it == PostPublicChangeImpact.SUMMARY
                    }
                ) {
                    add(PostReadCacheInvalidationTarget.DETAIL)
                }
            }
    }
}
