package com.back.boundedContexts.post.dto

import io.swagger.v3.oas.annotations.media.Schema

/**
 * 참조 구현: apache/answer (Apache-2.0), TryGhost/Ghost (MIT)
 * 관리자 글 일괄 처리 액션 타입.
 */
@Schema(description = "관리자 글 일괄 처리 액션 타입")
enum class AdmPostBulkActionType {
    DELETE,
    RESTORE,
    HARD_DELETE,
    PUBLISH_LISTED,
    PUBLISH_UNLISTED,
    UNPUBLISH_PRIVATE,
}
