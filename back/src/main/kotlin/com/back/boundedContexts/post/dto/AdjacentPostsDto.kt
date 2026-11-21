package com.back.boundedContexts.post.dto

/**
 * 인접 게시글(이전 글, 다음 글) 응답 DTO.
 *
 * 참조 구현: TryGhost/Ghost 인접 글 네비게이션 및 키셋 페이징 시맨틱.
 */
data class AdjacentPostsDto(
    val previousPost: FeedPostDto? = null,
    val nextPost: FeedPostDto? = null,
)
