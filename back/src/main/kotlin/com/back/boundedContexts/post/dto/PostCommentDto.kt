package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.domain.PostComment
import com.fasterxml.jackson.annotation.JsonCreator
import java.time.Instant

data class PostCommentDto @JsonCreator constructor(
    val id: Int,
    val createdAt: Instant,
    val modifiedAt: Instant,
    val authorId: Int,
    val authorName: String,
    val authorUsername: String,
    val authorProfileImageUrl: String,
    val postId: Int,
    val content: String,
    var actorCanModify: Boolean = false,
    var actorCanDelete: Boolean = false,
) {
    constructor(postComment: PostComment) : this(
        postComment.id,
        postComment.createdAt,
        postComment.modifiedAt,
        postComment.author.id,
        postComment.author.name,
        postComment.author.username,
        postComment.author.redirectToProfileImgUrlOrDefault,
        postComment.post.id,
        postComment.content,
    )

    fun forEventLog() = copy(content = "")
}
