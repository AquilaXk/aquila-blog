package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.domain.Post
import java.time.Instant

/**
 * `PostWithContentDto` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
data class PostWithContentDto(
    val id: Long,
    val createdAt: Instant,
    val modifiedAt: Instant,
    val authorId: Long,
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
