package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.domain.PostComment
import com.fasterxml.jackson.annotation.JsonCreator
import java.time.Instant

/**
 * `PostCommentDto` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
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
        constructor(postComment: PostComment) : this(
            postComment.id,
            postComment.createdAt,
            postComment.modifiedAt,
            postComment.author.id,
            postComment.author.name,
            postComment.author.username,
            postComment.author.redirectToProfileImgUrlVersionedOrDefault,
            postComment.author.profileImgUrlVersionedOrDefault,
            postComment.post.id,
            postComment.parentComment?.id,
            postComment.content,
        )

        fun forEventLog() = copy(content = "")
    }
