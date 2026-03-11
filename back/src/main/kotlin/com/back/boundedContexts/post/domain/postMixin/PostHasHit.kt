package com.back.boundedContexts.post.domain.postMixin

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr

const val HIT_COUNT = "hitCount"
private const val HIT_COUNT_DEFAULT_VALUE = 0

interface PostHasHit : PostAware {
    val hitCount: Int
        get() = post.hitCountAttr?.intValue ?: HIT_COUNT_DEFAULT_VALUE

    fun incrementHitCount() {
        val attr = post.hitCountAttr ?: PostAttr(0, post, HIT_COUNT, HIT_COUNT_DEFAULT_VALUE).also { post.hitCountAttr = it }
        attr.intValue = hitCount + 1
    }
}
