package com.back.boundedContexts.post.adapter.web

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
)

data class PostWriteResultDto(
    val id: Long,
    val title: String,
    val version: Long,
    val published: Boolean,
    val listed: Boolean,
)

data class PostHitResBody(
    val hitCount: Int,
)

data class PostLikeToggleResBody(
    val liked: Boolean,
    val likesCount: Int,
)
