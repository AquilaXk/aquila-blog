package com.back.boundedContexts.post.application.service

internal data class PostWriteSideEffectCommand(
    val postId: Long,
    val previousContent: String?,
    val currentContent: String?,
    val deletedContent: String?,
    val recommendationAction: PostRecommendationSideEffect,
)

internal enum class PostRecommendationSideEffect {
    REFRESH,
    EVICT,
}
