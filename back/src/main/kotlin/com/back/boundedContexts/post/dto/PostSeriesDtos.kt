package com.back.boundedContexts.post.dto

import java.time.Instant

data class PublicSeriesPostItemDto(
    val id: Long,
    val title: String,
    val seriesOrder: Int?,
    val createdAt: Instant,
)

data class PublicPostSeriesResBody(
    val seriesName: String?,
    val items: List<PublicSeriesPostItemDto>,
)
