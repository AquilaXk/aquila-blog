package com.back.boundedContexts.post.domain

import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberAware

const val POSTS_COUNT = "postsCount"
const val POSTS_COUNT_DEFAULT_VALUE = 0

const val POST_COMMENTS_COUNT = "postCommentsCount"
const val POST_COMMENTS_COUNT_DEFAULT_VALUE = 0

/**
 * `PostMember` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
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

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 도메인 계층에서 불변조건을 지키며 상태 전이를 캡슐화합니다.
     */
    fun getOrInitPostsCountAttr(): MemberAttr {
        if (postsCountAttr == null) {
            postsCountAttr = MemberAttr(0, member, POSTS_COUNT, POSTS_COUNT_DEFAULT_VALUE)
        }
        return postsCountAttr!!
    }

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 도메인 계층에서 불변조건을 지키며 상태 전이를 캡슐화합니다.
     */
    fun getOrInitPostCommentsCountAttr(): MemberAttr {
        if (postCommentsCountAttr == null) {
            postCommentsCountAttr = MemberAttr(0, member, POST_COMMENTS_COUNT, POST_COMMENTS_COUNT_DEFAULT_VALUE)
        }
        return postCommentsCountAttr!!
    }
}
