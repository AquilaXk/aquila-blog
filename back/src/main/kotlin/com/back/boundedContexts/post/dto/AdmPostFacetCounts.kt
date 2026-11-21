package com.back.boundedContexts.post.dto

/**
 * 참조 구현: TryGhost/Ghost (MIT) & payloadcms/payload (MIT)
 * 단일 테이블 스캔 facet 카운트 및 콘텐츠 참여 지표 DTO.
 */
data class AdmPostFacetCounts(
    val all: Long,
    val published: Long,
    val draft: Long,
    val privateCount: Long,
    val unlisted: Long,
    val deleted: Long,
    val totalHitCount: Long,
    val totalLikesCount: Long,
)
