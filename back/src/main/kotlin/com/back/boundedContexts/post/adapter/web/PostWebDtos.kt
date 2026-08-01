package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.model.PostSummarySource
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

data class PostLikeToggleResBody(
    val liked: Boolean,
    val likesCount: Int,
)
