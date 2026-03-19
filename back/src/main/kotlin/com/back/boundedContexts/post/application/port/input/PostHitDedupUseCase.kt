package com.back.boundedContexts.post.application.port.input

interface PostHitDedupUseCase {
    fun shouldCountHit(
        postId: Int,
        viewerKey: String,
    ): Boolean
}
