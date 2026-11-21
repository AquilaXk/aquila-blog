package com.back.boundedContexts.post.domain

import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberAware

const val POSTS_COUNT = "postsCount"
const val POSTS_COUNT_DEFAULT_VALUE = 0

interface PostMember : MemberAware {
    val username: String

    var postsCountAttr: MemberAttr?

    var postsCount: Int
        get() = getOrInitPostsCountAttr().intValue ?: POSTS_COUNT_DEFAULT_VALUE
        set(value) {
            getOrInitPostsCountAttr().value = value
        }

    fun incrementPostsCount() {
        postsCount++
    }

    fun decrementPostsCount() {
        postsCount--
    }

    fun getOrInitPostsCountAttr(): MemberAttr {
        if (postsCountAttr == null) {
            postsCountAttr = MemberAttr(0, member, POSTS_COUNT, POSTS_COUNT_DEFAULT_VALUE)
        }
        return postsCountAttr!!
    }
}
