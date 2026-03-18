package com.back.boundedContexts.post.domain.postMixin

import com.back.boundedContexts.post.domain.PostAttr

const val HIT_COUNT = "hitCount"
private const val HIT_COUNT_DEFAULT_VALUE = 0

/**
 * `PostHasHit` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface PostHasHit : PostAware {
    val hitCount: Int
        get() = post.hitCountAttr?.intValue ?: HIT_COUNT_DEFAULT_VALUE

    fun incrementHitCount() {
        val attr = post.hitCountAttr ?: PostAttr(0, post, HIT_COUNT, HIT_COUNT_DEFAULT_VALUE).also { post.hitCountAttr = it }
        attr.intValue = hitCount + 1
    }
}
