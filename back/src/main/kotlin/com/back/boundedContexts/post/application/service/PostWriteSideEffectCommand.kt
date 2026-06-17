package com.back.boundedContexts.post.application.service

internal data class PostWriteSideEffectCommand(
    val postId: Long,
    val previousContent: String?,
    val currentContent: String?,
    val deletedContent: String?,
    val beforeTags: List<String>,
    val afterTags: List<String>,
    val evictHotReadPages: Boolean,
    val evictSearchFirstPage: Boolean,
    val evictImpactedTagPages: Boolean,
    val evictTagsPublic: Boolean,
    val evictDetail: Boolean,
    val evictReason: String,
    val recommendationAction: PostRecommendationSideEffect,
)

internal enum class PostRecommendationSideEffect {
    REFRESH,
    EVICT,
}
