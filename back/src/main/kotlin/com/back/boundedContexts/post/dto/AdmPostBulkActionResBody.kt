package com.back.boundedContexts.post.dto

import io.swagger.v3.oas.annotations.media.Schema

/**
 * 참조 구현: apache/answer (Apache-2.0), TryGhost/Ghost (MIT)
 * 관리자 글 일괄 처리 응답 바디.
 */
@Schema(description = "관리자 글 일괄 처리 결과")
data class AdmPostBulkActionResBody(
    @field:Schema(description = "처리 완료된 글 수", example = "3")
    val processedCount: Int,
    @field:Schema(description = "처리 완료된 고유 글 ID 목록", example = "[1, 2, 3]")
    val ids: List<Long>,
)
