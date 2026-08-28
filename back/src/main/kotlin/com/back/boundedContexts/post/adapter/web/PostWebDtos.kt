package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.boundedContexts.post.model.PostSummarySource
import com.fasterxml.jackson.annotation.JsonIgnore
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

data class PostWriteRequest(
    @field:NotBlank
    @field:Size(min = 2, max = 100)
    val title: String,
    @field:NotBlank
    @field:Size(min = 2)
    val content: String,
    val contentHtml: String? = null,
    val published: Boolean?,
    val listed: Boolean?,
    val summaryMode: PostSummaryMode? = null,
    @field:Size(max = 1_000)
    val summary: String? = null,
)

data class PostModifyRequest(
    @field:NotBlank
    @field:Size(min = 2, max = 100)
    val title: String,
    @field:NotBlank
    @field:Size(min = 2)
    val content: String,
    val contentHtml: String? = null,
    val published: Boolean? = null,
    val listed: Boolean? = null,
    @field:Min(0)
    val version: Long,
    val summaryMode: PostSummaryMode? = null,
    @field:Size(max = 1_000)
    val summary: String? = null,
)

data class PostSummaryPreviewRequest(
    @field:NotBlank
    @field:Size(min = 2, max = 100)
    val title: String,
    @field:NotBlank
    @field:Size(min = 2, max = 100_000)
    val content: String,
)

data class PostSummaryPreviewResponse(
    val summary: String,
    val source: PostSummarySource,
    val contentHash: String,
    val algorithmVersion: String,
)

data class PostSummaryBackfillRequest(
    @field:Min(0)
    val afterId: Long = 0,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    @field:Min(1)
    val maxId: Long,
    @field:Min(1)
    @field:Max(500)
    val limit: Int = 100,
    val dryRun: Boolean = true,
) {
    @get:AssertTrue(message = "maxId must be greater than or equal to afterId")
    @get:JsonIgnore
    val isCheckpointWithinMaxId: Boolean
        get() = maxId >= afterId
}

data class PostSummaryBackfillResponse(
    val scanned: Int,
    val updated: Int,
    val skipped: Int,
    val nextAfterId: Long,
    val hasMore: Boolean,
    val dryRun: Boolean,
)

data class PostWriteResultDto(
    val id: Long,
    val title: String,
    val version: Long,
    val published: Boolean,
    val listed: Boolean,
    val summary: String,
    val summarySource: PostSummarySource,
)

data class PostHitResBody(
    val hitCount: Int,
)
