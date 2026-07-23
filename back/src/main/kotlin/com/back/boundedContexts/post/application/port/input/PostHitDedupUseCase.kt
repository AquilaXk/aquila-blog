package com.back.boundedContexts.post.application.port.input

interface PostHitDedupUseCase {
    fun shouldCountHit(
        postId: Long,
        viewerKey: String,
    ): Boolean
}
