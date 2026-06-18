package com.back.boundedContexts.post.application.service

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
)

internal enum class PostRecommendationSideEffect {
    REFRESH,
    EVICT,
}

internal enum class PostReadCacheInvalidationTarget {
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
    private val targets: Set<PostReadCacheInvalidationTarget>,
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

    fun evicts(target: PostReadCacheInvalidationTarget): Boolean = target in targets

    fun evictsPublicTags(): Boolean = evicts(PostReadCacheInvalidationTarget.PUBLIC_TAGS)

    fun isEmpty(): Boolean = targets.isEmpty()

    companion object {
        private val ALL_PUBLIC_READ_TARGETS = PostReadCacheInvalidationTarget.entries.toSet()

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
