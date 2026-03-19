package com.back.boundedContexts.post.dto

data class PostPreviewSummaryResult(
    val summary: String,
    val provider: String,
    val model: String?,
    val reason: String? = null,
)
