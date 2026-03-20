package com.back.boundedContexts.post.domain.postMixin

import com.back.boundedContexts.post.domain.PostAttr

const val LIKES_COUNT = "likesCount"
private const val LIKES_COUNT_DEFAULT_VALUE = 0

/**
 * `PostLikeToggleResult` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
data class PostLikeToggleResult(
    val isLiked: Boolean,
    val likeId: Long,
)

/**
 * `PostHasLikes` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
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
