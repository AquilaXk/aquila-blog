package com.back.boundedContexts.post.dto

import jakarta.validation.constraints.Min
import java.time.Instant

/**
 * 참조 구현: TryGhost/Ghost (MIT) & payloadcms/payload (MIT) — 게시글 리비전 원장 요약·스냅샷 DTO
 */
data class PostRevisionSummaryDto(
    val id: Long,
    val postId: Long,
    val title: String,
    val summaryText: String?,
    val contentLength: Int,
    val createdAt: Instant,
)

data class PostRevisionSnapshotDto(
    val id: Long,
    val postId: Long,
    val authorId: Long,
    val title: String,
    val content: String,
    val summaryText: String?,
    val createdAt: Instant,
)

data class AdmPostRevisionRestoreRequest(
    @field:Min(0)
    val expectedVersion: Long? = null,
)
