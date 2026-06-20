package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.domain.Post
import com.fasterxml.jackson.annotation.JsonCreator
import java.time.Instant

data class PostDto
    @JsonCreator
    constructor(
        val id: Long,
        val createdAt: Instant,
        val modifiedAt: Instant,
        val authorId: Long,
        val authorName: String,
        val authorUsername: String,
        val authorProfileImgUrl: String,
        val title: String,
        val thumbnail: String? = null,
        val summary: String,
        val version: Long,
        val published: Boolean,
        val listed: Boolean,
        var tempDraft: Boolean = false,
        val likesCount: Int,
        val commentsCount: Int,
        val hitCount: Int,
        var actorHasLiked: Boolean = false,
    ) {
        constructor(post: Post) : this(post, PostPreviewExtractor.extract(post.content))

        private constructor(
            post: Post,
            preview: PostPreviewExtractor.Preview,
        ) : this(
            post.id,
            post.createdAt,
            post.modifiedAt,
            post.author.id,
            post.author.name,
            post.author.name,
            post.author.profileImgUrlVersionedOrDefault,
            post.title,
            preview.thumbnail,
            preview.summary,
            post.version ?: 0L,
            post.published,
            post.listed,
            false,
            post.likesCount,
            post.commentsCount,
            post.hitCount,
        )

        fun forEventLog() = copy(title = "")
    }
