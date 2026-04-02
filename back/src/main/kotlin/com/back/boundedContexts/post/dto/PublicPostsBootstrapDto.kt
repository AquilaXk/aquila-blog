package com.back.boundedContexts.post.dto

/**
 * 공개 홈 bootstrap 응답 DTO.
 * 홈 첫 화면에서 필요한 feed + tag count snapshot을 한 번에 전달한다.
 */
data class PublicPostsBootstrapDto(
    val feed: CursorFeedPageDto,
    val tags: List<TagCountDto>,
)
