package com.back.boundedContexts.post.domain

import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberAware

const val POSTS_COUNT = "postsCount"
const val POSTS_COUNT_DEFAULT_VALUE = 0

const val POST_COMMENTS_COUNT = "postCommentsCount"
const val POST_COMMENTS_COUNT_DEFAULT_VALUE = 0

interface PostMember : MemberAware {
    var postsCountAttr: MemberAttr?

    var postCommentsCountAttr: MemberAttr?

    var postsCount: Int
        get() = getOrInitPostsCountAttr().intValue ?: POSTS_COUNT_DEFAULT_VALUE
        set(value) {
            getOrInitPostsCountAttr().value = value
        }

    var postCommentsCount: Int
        get() = getOrInitPostCommentsCountAttr().intValue ?: POST_COMMENTS_COUNT_DEFAULT_VALUE
        set(value) {
            getOrInitPostCommentsCountAttr().value = value
        }

    fun incrementPostsCount() {
        postsCount++
    }

    fun decrementPostsCount() {
        postsCount--
    }

    fun incrementPostCommentsCount() {
        postCommentsCount++
    }

    fun decrementPostCommentsCount() {
        postCommentsCount--
    }

    fun getOrInitPostsCountAttr(): MemberAttr {
        if (postsCountAttr == null) {
            postsCountAttr = MemberAttr(0, member, POSTS_COUNT, POSTS_COUNT_DEFAULT_VALUE)
        }
        return postsCountAttr!!
    }

    fun getOrInitPostCommentsCountAttr(): MemberAttr {
        if (postCommentsCountAttr == null) {
            postCommentsCountAttr = MemberAttr(0, member, POST_COMMENTS_COUNT, POST_COMMENTS_COUNT_DEFAULT_VALUE)
        }
        return postCommentsCountAttr!!
    }
}
