package com.back.boundedContexts.post.application.port.input

import java.time.Instant

interface PostScheduledPublishUseCase {
    fun publishDueScheduledPosts(
        now: Instant? = null,
        batchSize: Int = 50,
    ): Int
}
