package com.back.boundedContexts.post.dto

import java.time.Instant

/**
 * 공개 상세 read 캐시를 메타/본문으로 분리하기 위한 캐시 전용 DTO입니다.
 * 본문이 큰 글은 content 캐시를 생략할 수 있어 Redis 메모리 폭주를 완화합니다.
 */
data class PublicPostDetailMetaCacheDto(
    var id: Long = 0L,
    var createdAt: Instant = Instant.EPOCH,
    var modifiedAt: Instant = Instant.EPOCH,
    var authorId: Long = 0L,
    var authorName: String = "",
    var authorUsername: String = "",
    var authorProfileImageUrl: String = "",
    var authorProfileImageDirectUrl: String = "",
    var title: String = "",
    var version: Long = 0L,
    var published: Boolean = false,
    var listed: Boolean = false,
    var likesCount: Int = 0,
    var commentsCount: Int = 0,
    var hitCount: Int = 0,
) {
    fun merge(content: PublicPostDetailContentCacheDto): PostWithContentDto =
        PostWithContentDto(
            id = id,
            createdAt = createdAt,
            modifiedAt = modifiedAt,
            authorId = authorId,
            authorName = authorName,
            authorUsername = authorUsername,
            authorProfileImageUrl = authorProfileImageUrl,
            authorProfileImageDirectUrl = authorProfileImageDirectUrl,
            title = title,
            content = content.content,
            contentHtml = content.contentHtml,
            version = version,
            published = published,
            listed = listed,
            likesCount = likesCount,
            commentsCount = commentsCount,
            hitCount = hitCount,
        )

    companion object {
        fun from(detail: PostWithContentDto): PublicPostDetailMetaCacheDto =
            PublicPostDetailMetaCacheDto(
                id = detail.id,
                createdAt = detail.createdAt,
                modifiedAt = detail.modifiedAt,
                authorId = detail.authorId,
                authorName = detail.authorName,
                authorUsername = detail.authorUsername,
                authorProfileImageUrl = detail.authorProfileImageUrl,
                authorProfileImageDirectUrl = detail.authorProfileImageDirectUrl,
                title = detail.title,
                version = detail.version,
                published = detail.published,
                listed = detail.listed,
                likesCount = detail.likesCount,
                commentsCount = detail.commentsCount,
                hitCount = detail.hitCount,
            )
    }
}

data class PublicPostDetailContentCacheDto(
    var content: String = "",
    var contentHtml: String? = null,
) {
    companion object {
        fun from(detail: PostWithContentDto): PublicPostDetailContentCacheDto =
            PublicPostDetailContentCacheDto(
                content = detail.content,
                contentHtml = detail.contentHtml,
            )
    }
}

data class PublicPostDetailSnapshotCacheDto(
    var id: Long = 0L,
    var createdAt: Instant = Instant.EPOCH,
    var modifiedAt: Instant = Instant.EPOCH,
    var authorId: Long = 0L,
    var authorName: String = "",
    var authorUsername: String = "",
    var authorProfileImageUrl: String = "",
    var authorProfileImageDirectUrl: String = "",
    var title: String = "",
    var content: String = "",
    var contentHtml: String? = null,
    var version: Long = 0L,
    var published: Boolean = false,
    var listed: Boolean = false,
    var likesCount: Int = 0,
    var commentsCount: Int = 0,
    var hitCount: Int = 0,
) {
    fun toPostWithContentDto(): PostWithContentDto =
        PostWithContentDto(
            id = id,
            createdAt = createdAt,
            modifiedAt = modifiedAt,
            authorId = authorId,
            authorName = authorName,
            authorUsername = authorUsername,
            authorProfileImageUrl = authorProfileImageUrl,
            authorProfileImageDirectUrl = authorProfileImageDirectUrl,
            title = title,
            content = content,
            contentHtml = contentHtml,
            version = version,
            published = published,
            listed = listed,
            likesCount = likesCount,
            commentsCount = commentsCount,
            hitCount = hitCount,
        )

    companion object {
        fun from(detail: PostWithContentDto): PublicPostDetailSnapshotCacheDto =
            PublicPostDetailSnapshotCacheDto(
                id = detail.id,
                createdAt = detail.createdAt,
                modifiedAt = detail.modifiedAt,
                authorId = detail.authorId,
                authorName = detail.authorName,
                authorUsername = detail.authorUsername,
                authorProfileImageUrl = detail.authorProfileImageUrl,
                authorProfileImageDirectUrl = detail.authorProfileImageDirectUrl,
                title = detail.title,
                content = detail.content,
                contentHtml = detail.contentHtml,
                version = detail.version,
                published = detail.published,
                listed = detail.listed,
                likesCount = detail.likesCount,
                commentsCount = detail.commentsCount,
                hitCount = detail.hitCount,
            )
    }
}
