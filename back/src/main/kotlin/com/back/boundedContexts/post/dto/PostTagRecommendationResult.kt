package com.back.boundedContexts.post.dto

data class PostTagRecommendationResult(
    val tags: List<String>,
    val provider: String,
    val model: String?,
    val reason: String? = null,
    val traceId: String? = null,
)
