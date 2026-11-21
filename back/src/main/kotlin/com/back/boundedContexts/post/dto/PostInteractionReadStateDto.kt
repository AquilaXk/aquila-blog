package com.back.boundedContexts.post.dto

data class PostInteractionReadStateDto(
    val id: Long,
    val authorId: Long,
    val published: Boolean,
    val hitCount: Int,
    val likesCount: Int,
)
