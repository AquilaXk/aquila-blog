package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.boundedContexts.post.model.PostSummarySource
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size
import java.time.Instant

data class PostWriteRequest(
    @field:NotBlank
    @field:Size(min = 2, max = 100)
    val title: String,
    @field:NotBlank
    @field:Size(min = 2, max = 500_000)
    val content: String,
    val contentHtml: String? = null,
    val published: Boolean?,
    val listed: Boolean?,
    @field:NotNull
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val summaryMode: PostSummaryMode,
    @field:Size(max = 300)
    val summary: String? = null,
    val scheduledAt: Instant? = null,
    @field:Size(max = 120)
    val seriesName: String? = null,
    @field:Min(1)
    val seriesOrder: Int? = null,
    @field:Size(max = 2048)
    val canonicalUrl: String? = null,
)

data class PostModifyRequest(
    @field:NotBlank
    @field:Size(min = 2, max = 100)
    val title: String,
    @field:NotBlank
    @field:Size(min = 2, max = 500_000)
    val content: String,
    val contentHtml: String? = null,
    val published: Boolean? = null,
    val listed: Boolean? = null,
    @field:Min(0)
    val version: Long,
    val summaryMode: PostSummaryMode? = null,
    @field:Size(max = 300)
    val summary: String? = null,
    val scheduledAt: Instant? = null,
    @field:Size(max = 120)
    val seriesName: String? = null,
    @field:Min(1)
    val seriesOrder: Int? = null,
    @field:Size(max = 2048)
    val canonicalUrl: String? = null,
)

data class PostWriteResultDto(
    val id: Long,
    val title: String,
    val version: Long,
    val published: Boolean,
    val listed: Boolean,
    val summary: String,
    val summarySource: PostSummarySource,
    val scheduledAt: Instant?,
    val seriesName: String?,
    val seriesOrder: Int?,
    val canonicalUrl: String?,
)

data class PostHitResBody(
    val hitCount: Int,
)

data class PostLikeToggleResBody(
    val liked: Boolean,
    val likesCount: Int,
)
