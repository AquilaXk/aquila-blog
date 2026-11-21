package com.back.boundedContexts.post.application.port.output

import com.back.boundedContexts.post.dto.PostRevisionSnapshotDto
import com.back.boundedContexts.post.dto.PostRevisionSummaryDto

/**
 * 참조 구현: TryGhost/Ghost (MIT) & payloadcms/payload (MIT) — 게시글 리비전 원장 저장소 포트
 */
interface PostRevisionRepositoryPort {
    fun appendAndTrimRevisions(
        postId: Long,
        authorId: Long,
        title: String,
        content: String,
        summaryText: String?,
        maxRevisionsPerPost: Int,
    ): Long?

    fun findSummariesByPostId(
        postId: Long,
        limit: Int,
    ): List<PostRevisionSummaryDto>

    fun findByPostIdAndRevisionId(
        postId: Long,
        revisionId: Long,
    ): PostRevisionSnapshotDto?

    fun deleteByPostId(postId: Long)
}
