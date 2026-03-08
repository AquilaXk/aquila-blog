package com.back.boundedContexts.post.domain.postCommentMixin

import com.back.boundedContexts.post.domain.PostComment

interface PostCommentAware {
    val postComment: PostComment
}
