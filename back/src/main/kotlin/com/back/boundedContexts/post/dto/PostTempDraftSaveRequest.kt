package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.model.PostSummaryMode
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.Size

/**
 * 참조 구현: TryGhost/Ghost (MIT), payloadcms/payload (MIT)
 * 서버 임시초안 비승격 자동저장 요청 DTO.
 * 빈 문자열과 1글자 제목/본문을 허용하며, 본문 상한 500,000자를 Fail-Closed로 제한합니다.
 */
@Schema(description = "임시초안 자동저장 요청")
data class PostTempDraftSaveRequest(
    @field:Size(max = 100)
    @field:Schema(description = "글 제목", example = "임시 제목", maxLength = 100)
    val title: String = "",
    @field:Size(max = 500_000)
    @field:Schema(description = "글 본문 (최대 500,000자)", example = "임시 본문", maxLength = 500000)
    val content: String = "",
    @field:Schema(description = "낙관적 락 버전", example = "1")
    val version: Long? = null,
    @field:Size(max = 300)
    @field:Schema(description = "요약문", example = "요약", maxLength = 300)
    val summary: String? = null,
    @field:Schema(description = "요약 모드")
    val summaryMode: PostSummaryMode? = null,
    @field:Size(max = 2048)
    @field:Schema(description = "대표 썸네일 URL", example = "https://example.com/thumb.jpg", maxLength = 2048)
    val thumbnail: String? = null,
)
