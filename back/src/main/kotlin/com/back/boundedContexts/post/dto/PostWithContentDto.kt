package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.domain.Post
import java.time.Instant

data class PostWithContentDto(
    val id: Int,
    val createdAt: Instant,
    val modifiedAt: Instant,
    val authorId: Int,
    val authorName: String,
    val authorUsername: String,
    val authorProfileImageUrl: String,
    val authorProfileImageDirectUrl: String,
    val title: String,
    val content: String,
    val contentHtml: String?,
    val version: Long,
    val published: Boolean,
    val listed: Boolean,
    val likesCount: Int,
    val commentsCount: Int,
    val hitCount: Int,
    var actorHasLiked: Boolean = false,
    var actorCanModify: Boolean = false,
    var actorCanDelete: Boolean = false,
) {
    constructor(post: Post) : this(
        post.id,
        post.createdAt,
        post.modifiedAt,
        post.author.id,
        post.author.name,
        post.author.username,
        post.author.redirectToProfileImgUrlVersionedOrDefault,
        post.author.profileImgUrlVersionedOrDefault,
        post.title,
        post.content,
        post.contentHtml,
        post.version ?: 0L,
        post.published,
        post.listed,
        post.likesCount,
        post.commentsCount,
        post.hitCount,
    )
}
