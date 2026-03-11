package com.back.boundedContexts.post.domain.postMixin

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.PostComment

const val COMMENTS_COUNT = "commentsCount"
private const val COMMENTS_COUNT_DEFAULT_VALUE = 0

interface PostHasComments : PostAware {
    var commentsCount: Int
        get() = post.commentsCountAttr?.intValue ?: COMMENTS_COUNT_DEFAULT_VALUE
        set(value) {
            val attr =
                post.commentsCountAttr
                    ?: PostAttr(0, post, COMMENTS_COUNT, value).also { post.commentsCountAttr = it }
            attr.intValue = value
        }

    fun newComment(author: Member, content: String, parentComment: PostComment? = null): PostComment =
        PostComment(
            id = 0,
            author = author,
            post = post,
            content = content,
            parentComment = parentComment,
        )

    fun onCommentAdded() {
        commentsCount++
    }

    fun onCommentDeleted() {
        commentsCount--
    }
}
