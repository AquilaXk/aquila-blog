package com.back.boundedContexts.post.dto

import java.time.Instant

data class AdmDeletedPostDto(
    val id: Long,
    val title: String,
    val authorId: Long,
    val authorName: String,
    val authorProfileImgUrl: String,
    val published: Boolean,
    val listed: Boolean,
    val createdAt: Instant,
    val modifiedAt: Instant,
    val deletedAt: Instant,
)
