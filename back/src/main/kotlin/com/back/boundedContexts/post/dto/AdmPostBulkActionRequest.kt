package com.back.boundedContexts.post.dto

import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.NotEmpty
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.Size

/**
 * 참조 구현: apache/answer (Apache-2.0), TryGhost/Ghost (MIT)
 * 관리자 글 일괄 처리 요청 DTO.
 * 빈 목록 거부 및 50개 상한 Fail-Closed 적용.
 */
@Schema(description = "관리자 글 일괄 처리 요청")
data class AdmPostBulkActionRequest(
    @field:NotEmpty
    @field:Size(min = 1, max = 50)
    @field:Schema(description = "대상 글 ID 목록 (1~50개)", example = "[1, 2, 3]")
    val ids: List<@Positive Long>,
    @field:Schema(description = "일괄 수행할 액션")
    val action: AdmPostBulkActionType,
) {
    @get:AssertTrue(message = "글 ID는 1 이상의 양수여야 합니다.")
    @get:Schema(hidden = true)
    val hasValidPositiveIds: Boolean
        get() = ids.all { it > 0 }
}
