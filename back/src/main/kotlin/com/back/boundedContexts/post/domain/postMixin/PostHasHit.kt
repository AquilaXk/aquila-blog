package com.back.boundedContexts.post.domain.postMixin

const val HIT_COUNT = "hitCount"

interface PostHasHit : PostAware {
    val hitCount: Int
        get() = post.hitCount

    fun incrementHitCount() {
        post.hitCount += 1
    }
}
