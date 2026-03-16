package com.back.boundedContexts.post.dto

data class AdmDeletedPostSnapshotDto(
    val id: Int,
    val title: String,
    val content: String,
    val authorId: Int,
)
