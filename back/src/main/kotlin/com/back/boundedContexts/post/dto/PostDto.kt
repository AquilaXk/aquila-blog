package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.model.PostSummarySource
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
        val hitCount: Int,
        val tags: List<String> = emptyList(),
        val category: List<String> = emptyList(),
        val summarySource: PostSummarySource = PostSummarySource.NONE,
    ) {
        constructor(post: Post) : this(post, PostPreviewExtractor.extractThumbnail(post.content))

        private constructor(
            post: Post,
            thumbnail: String?,
            meta: PostMetaExtractor.PostMeta,
        ) : this(
            post.id,
            post.createdAt,
            post.modifiedAt,
            post.author.id,
            post.author.name,
            post.author.name,
            post.author.profileImgUrlVersionedOrDefault,
            post.title,
            thumbnail,
            post.summaryText.orEmpty(),
            post.version ?: 0L,
            post.published,
            post.listed,
            false,
            post.likesCount,
            post.hitCount,
            tags = meta.tags,
            category = meta.categories,
            summarySource = post.summarySource,
        )

        private constructor(
            post: Post,
            thumbnail: String?,
        ) : this(post, thumbnail, PostMetaExtractor.extract(post.content))

        fun forEventLog() = copy(title = "", summary = "")
    }
