package com.back.boundedContexts.post.domain.postMixin

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr

const val LIKES_COUNT = "likesCount"
private const val LIKES_COUNT_DEFAULT_VALUE = 0

data class PostLikeToggleResult(val isLiked: Boolean, val likeId: Int)

interface PostHasLikes : PostAware {
    var likesCount: Int
        get() = post.likesCountAttr?.intValue ?: LIKES_COUNT_DEFAULT_VALUE
        set(value) {
            val attr = post.likesCountAttr ?: PostAttr(0, post, LIKES_COUNT, value).also { post.likesCountAttr = it }
            attr.intValue = value
        }

    fun onLikeAdded() {
        likesCount++
    }

    fun onLikeRemoved() {
        likesCount--
    }
}
