package com.back.boundedContexts.post.dto

data class AdmDeletedPostSnapshotDto(
    val id: Long,
    val title: String,
    val content: String,
    val authorId: Long,
    val published: Boolean,
    val listed: Boolean,
)
