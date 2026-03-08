package com.back.boundedContexts.post.domain

import com.back.boundedContexts.member.domain.shared.Member.Companion.attrRepository
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberAware

private const val POSTS_COUNT = "postsCount"
private const val POSTS_COUNT_DEFAULT_VALUE = 0

private const val POST_COMMENTS_COUNT = "postCommentsCount"
private const val POST_COMMENTS_COUNT_DEFAULT_VALUE = 0

interface PostMember : MemberAware {
    private val postsCountAttr: MemberAttr
        get() = member.getOrPutAttr(POSTS_COUNT) {
            attrRepository.findBySubjectAndName(member, POSTS_COUNT)
                ?: MemberAttr(0, member, POSTS_COUNT, POSTS_COUNT_DEFAULT_VALUE)
        }

    private val postCommentsCountAttr: MemberAttr
        get() = member.getOrPutAttr(POST_COMMENTS_COUNT) {
            attrRepository.findBySubjectAndName(member, POST_COMMENTS_COUNT)
                ?: MemberAttr(0, member, POST_COMMENTS_COUNT, POST_COMMENTS_COUNT_DEFAULT_VALUE)
        }

    var postsCount: Int
        get() = postsCountAttr.intValue ?: POSTS_COUNT_DEFAULT_VALUE
        set(value) {
            postsCountAttr.value = value
            attrRepository.save(postsCountAttr)
        }

    var postCommentsCount: Int
        get() = postCommentsCountAttr.intValue ?: POST_COMMENTS_COUNT_DEFAULT_VALUE
        set(value) {
            postCommentsCountAttr.value = value
            attrRepository.save(postCommentsCountAttr)
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
}
