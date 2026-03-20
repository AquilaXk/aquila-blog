package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.domain.Post
import com.fasterxml.jackson.annotation.JsonCreator
import java.time.Instant

/**
 * `PostDto` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
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
            post.author.username,
            post.author.profileImgUrlVersionedOrDefault,
            post.title,
            preview.thumbnail,
            preview.summary,
            post.version ?: 0L,
            post.published,
            post.listed,
            post.likesCount,
            post.commentsCount,
            post.hitCount,
        )

        fun forEventLog() = copy(title = "")
    }
