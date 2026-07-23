package com.back.boundedContexts.post.application.service

import com.back.global.task.annotation.Task
import com.back.standard.dto.TaskPayload
import java.util.UUID

@Task(
    type = PostWriteSideEffectPayload.TASK_TYPE,
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
) : TaskPayload {
    companion object {
        const val TASK_TYPE = "post.write.side-effect"
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
}

enum class PostReadCacheInvalidationTarget {
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
                add(PostReadCacheInvalidationTarget.HOT_READ_PAGES)
                if (
                    impacts.any {
                        it == PostPublicChangeImpact.LISTING_VISIBILITY ||
                            it == PostPublicChangeImpact.TITLE ||
                            it == PostPublicChangeImpact.CONTENT ||
                            it == PostPublicChangeImpact.TAG
                    }
                ) {
                    add(PostReadCacheInvalidationTarget.SEARCH_FIRST_PAGE)
                }
                if (
                    impacts.any {
                        it == PostPublicChangeImpact.LISTING_VISIBILITY ||
                            it == PostPublicChangeImpact.TAG
                    }
                ) {
                    add(PostReadCacheInvalidationTarget.IMPACTED_TAG_PAGES)
                    add(PostReadCacheInvalidationTarget.PUBLIC_TAGS)
                }
                if (
                    impacts.any {
                        it == PostPublicChangeImpact.LISTING_VISIBILITY ||
                            it == PostPublicChangeImpact.TITLE ||
                            it == PostPublicChangeImpact.CONTENT
                    }
                ) {
                    add(PostReadCacheInvalidationTarget.DETAIL)
                }
            }
    }
}
