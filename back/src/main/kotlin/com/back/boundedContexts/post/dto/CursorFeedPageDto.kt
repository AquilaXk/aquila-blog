package com.back.boundedContexts.post.dto

/**
 * 커서 기반 공개 피드/탐색 응답 DTO.
 * page 기반 totalCount 대신 다음 커서 유무로 페이징을 진행한다.
 */
data class CursorFeedPageDto(
    val content: List<FeedPostDto>,
    val pageSize: Int,
    val hasNext: Boolean,
    val nextCursor: String? = null,
)
