package com.back.boundedContexts.post.domain.postMixin

import com.back.boundedContexts.post.domain.Post

interface PostAware {
    val post: Post
}
