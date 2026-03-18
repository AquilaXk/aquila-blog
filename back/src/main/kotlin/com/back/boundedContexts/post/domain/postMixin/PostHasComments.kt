package com.back.boundedContexts.post.domain.postMixin

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.PostComment

const val COMMENTS_COUNT = "commentsCount"
private const val COMMENTS_COUNT_DEFAULT_VALUE = 0

/**
 * `PostHasComments` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface PostHasComments : PostAware {
    var commentsCount: Int
        get() = post.commentsCountAttr?.intValue ?: COMMENTS_COUNT_DEFAULT_VALUE
        set(value) {
            val attr =
                post.commentsCountAttr
                    ?: PostAttr(0, post, COMMENTS_COUNT, value).also { post.commentsCountAttr = it }
            attr.intValue = value
        }

    fun newComment(
        author: Member,
        content: String,
        parentComment: PostComment? = null,
    ): PostComment =
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
