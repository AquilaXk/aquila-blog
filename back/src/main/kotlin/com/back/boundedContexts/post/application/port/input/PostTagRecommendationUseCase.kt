package com.back.boundedContexts.post.application.port.input

import com.back.boundedContexts.post.dto.PostTagRecommendationResult

/**
 * PostTagRecommendationUseCase는 글 본문 기반 태그 추천 유스케이스 계약입니다.
 * 관리자 작성 흐름에서 AI/규칙 추천 결과를 동일 포맷으로 제공하기 위해 사용합니다.
 */
interface PostTagRecommendationUseCase {
    fun recommend(
        title: String,
        content: String,
        existingTags: List<String>,
        maxTags: Int,
    ): PostTagRecommendationResult
}
