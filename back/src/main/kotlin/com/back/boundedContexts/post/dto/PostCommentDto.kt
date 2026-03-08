package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.domain.PostComment
import java.time.Instant

data class PostCommentDto(
    val id: Int,
    val createdAt: Instant,
    val modifiedAt: Instant,
    val authorId: Int,
    val authorName: String,
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
        postComment.author.redirectToProfileImgUrlOrDefault,
        postComment.post.id,
        postComment.content,
    )
}
