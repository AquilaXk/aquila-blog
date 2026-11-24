package com.back.boundedContexts.post.dto

import com.fasterxml.jackson.annotation.JsonCreator
import java.time.Instant

data class PublicWikilinkCatalogItemDto
    @JsonCreator
    constructor(
        val id: Long,
        val title: String,
        val createdAt: Instant,
    )

data class PublicWikilinkCatalogResBody
    @JsonCreator
    constructor(
        val items: List<PublicWikilinkCatalogItemDto> = emptyList(),
    )

data class PublicPostBacklinkItemDto
    @JsonCreator
    constructor(
        val id: Long,
        val title: String,
        val summary: String = "",
        val createdAt: Instant,
        val modifiedAt: Instant,
    )

data class PublicPostBacklinksResBody
    @JsonCreator
    constructor(
        val items: List<PublicPostBacklinkItemDto> = emptyList(),
    )

data class PublicBacklinkCandidateProjection(
    val id: Long,
    val title: String,
    val summaryText: String?,
    val content: String,
    val createdAt: Instant,
    val modifiedAt: Instant,
)
