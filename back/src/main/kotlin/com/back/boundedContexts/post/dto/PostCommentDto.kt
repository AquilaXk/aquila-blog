package com.back.boundedContexts.post.dto

import com.fasterxml.jackson.annotation.JsonCreator
import java.time.Instant

data class PostCommentDto
    @JsonCreator
    constructor(
        val id: Long,
        val createdAt: Instant,
        val modifiedAt: Instant,
        val authorId: Long,
        val authorName: String,
        val authorUsername: String,
        val authorProfileImageUrl: String,
        val authorProfileImageDirectUrl: String,
        val postId: Long,
        val parentCommentId: Long?,
        val content: String,
        var actorCanModify: Boolean = false,
        var actorCanDelete: Boolean = false,
    ) {
        fun forEventLog() = copy(content = "")
    }
