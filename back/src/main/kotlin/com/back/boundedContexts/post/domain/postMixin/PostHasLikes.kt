package com.back.boundedContexts.post.domain.postMixin

const val LIKES_COUNT = "likesCount"

interface PostHasLikes : PostAware {
    var likesCount: Int
        get() = post.likesCount
        set(value) {
            post.likesCount = value
        }
}
