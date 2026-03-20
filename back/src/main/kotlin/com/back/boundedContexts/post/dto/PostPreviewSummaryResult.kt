package com.back.boundedContexts.post.dto

data class PostPreviewSummaryDebug(
    val cacheStatus: String? = null,
    val promptLength: Int? = null,
    val promptPreview: String? = null,
    val strictResponseStatus: Int? = null,
    val strictResponsePreview: String? = null,
    val relaxedRetried: Boolean? = null,
    val relaxedResponseStatus: Int? = null,
    val relaxedResponsePreview: String? = null,
    val parsedSummaryLength: Int? = null,
    val parsedSummaryPreview: String? = null,
)

data class PostPreviewSummaryResult(
    val summary: String,
    val provider: String,
    val model: String?,
    val reason: String? = null,
    val traceId: String? = null,
    val debug: PostPreviewSummaryDebug? = null,
)
