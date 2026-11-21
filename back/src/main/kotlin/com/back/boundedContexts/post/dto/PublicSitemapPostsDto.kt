package com.back.boundedContexts.post.dto

import java.time.Instant

/**
 * 참조 구현: TryGhost/Ghost (MIT) & payloadcms/payload (MIT) — 공개 경량 Sitemap 엔트리 DTO
 */
data class PublicSitemapPostItemDto(
    val id: Long,
    val createdAt: Instant,
    val modifiedAt: Instant,
)

data class PublicSitemapPostsResBody(
    val items: List<PublicSitemapPostItemDto>,
)
