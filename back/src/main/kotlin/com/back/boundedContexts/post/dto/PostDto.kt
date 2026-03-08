package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.domain.Post
import com.fasterxml.jackson.annotation.JsonCreator
import java.time.Instant

data class PostDto @JsonCreator constructor(
    val id: Int,
    val createdAt: Instant,
    val modifiedAt: Instant,
    val authorId: Int,
    val authorName: String,
    val authorProfileImgUrl: String,
    val title: String,
    val published: Boolean,
    val listed: Boolean,
    val likesCount: Int,
    val commentsCount: Int,
    val hitCount: Int,
    var actorHasLiked: Boolean = false,
) {
    constructor(post: Post) : this(
        post.id,
        post.createdAt,
        post.modifiedAt,
        post.author.id,
        post.author.name,
        post.author.redirectToProfileImgUrlOrDefault,
        post.title,
        post.published,
        post.listed,
        post.likesCount,
        post.commentsCount,
        post.hitCount,
    )

    fun forEventLog() = copy(title = "")
}
