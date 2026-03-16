package com.back.boundedContexts.post.dto

import java.time.Instant

data class AdmDeletedPostDto(
    val id: Int,
    val title: String,
    val authorId: Int,
    val authorName: String,
    val published: Boolean,
    val listed: Boolean,
    val createdAt: Instant,
    val modifiedAt: Instant,
    val deletedAt: Instant,
)
