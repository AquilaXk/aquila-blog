package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.model.PostSummarySource
import com.back.global.security.application.ContentHtmlTrustState
import com.back.global.security.application.HtmlContentSanitizer
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
    var hitCount: Int = 0,
    var summary: String = "",
    var summarySource: PostSummarySource = PostSummarySource.NONE,
) {
    fun merge(content: PublicPostDetailContentCacheDto): PostWithContentDto {
        val contentHtmlTrust = content.verifyContentHtmlTrust()
        return PostWithContentDto(
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
            contentHtml = contentHtmlTrust.contentHtml,
            version = version,
            published = published,
            listed = listed,
            likesCount = likesCount,
            hitCount = hitCount,
            summary = summary,
            summarySource = summarySource,
            contentHtmlHash = contentHtmlTrust.contentHtmlHash,
            contentHtmlSanitizerPolicyVersion = contentHtmlTrust.contentHtmlSanitizerPolicyVersion,
            contentHtmlTrustState = contentHtmlTrust.contentHtmlTrustState,
        )
    }

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
                hitCount = detail.hitCount,
                summary = detail.summary,
                summarySource = detail.summarySource,
            )
    }
}

data class PublicPostDetailContentCacheDto(
    var content: String = "",
    var contentHtml: String? = null,
    var contentHtmlHash: String? = null,
    var contentHtmlSanitizerPolicyVersion: String? = null,
    var contentHtmlTrustState: ContentHtmlTrustState = ContentHtmlTrustState.UNKNOWN,
) {
    fun verifyContentHtmlTrust() =
        HtmlContentSanitizer.verifyStored(
            contentHtml,
            contentHtmlHash,
            contentHtmlSanitizerPolicyVersion,
            contentHtmlTrustState,
        )

    companion object {
        fun from(detail: PostWithContentDto): PublicPostDetailContentCacheDto =
            PublicPostDetailContentCacheDto(
                content = detail.content,
                contentHtml = detail.contentHtml,
                contentHtmlHash = detail.contentHtmlHash,
                contentHtmlSanitizerPolicyVersion = detail.contentHtmlSanitizerPolicyVersion,
                contentHtmlTrustState = detail.contentHtmlTrustState,
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
    var contentHtmlHash: String? = null,
    var contentHtmlSanitizerPolicyVersion: String? = null,
    var contentHtmlTrustState: ContentHtmlTrustState = ContentHtmlTrustState.UNKNOWN,
    var version: Long = 0L,
    var published: Boolean = false,
    var listed: Boolean = false,
    var likesCount: Int = 0,
    var hitCount: Int = 0,
    var summary: String = "",
    var summarySource: PostSummarySource = PostSummarySource.NONE,
) {
    fun toPostWithContentDto(): PostWithContentDto {
        val contentHtmlTrust =
            HtmlContentSanitizer.verifyStored(
                contentHtml,
                contentHtmlHash,
                contentHtmlSanitizerPolicyVersion,
                contentHtmlTrustState,
            )
        return PostWithContentDto(
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
            contentHtml = contentHtmlTrust.contentHtml,
            version = version,
            published = published,
            listed = listed,
            likesCount = likesCount,
            hitCount = hitCount,
            summary = summary,
            summarySource = summarySource,
            contentHtmlHash = contentHtmlTrust.contentHtmlHash,
            contentHtmlSanitizerPolicyVersion = contentHtmlTrust.contentHtmlSanitizerPolicyVersion,
            contentHtmlTrustState = contentHtmlTrust.contentHtmlTrustState,
        )
    }

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
                contentHtmlHash = detail.contentHtmlHash,
                contentHtmlSanitizerPolicyVersion = detail.contentHtmlSanitizerPolicyVersion,
                contentHtmlTrustState = detail.contentHtmlTrustState,
                version = detail.version,
                published = detail.published,
                listed = detail.listed,
                likesCount = detail.likesCount,
                hitCount = detail.hitCount,
                summary = detail.summary,
                summarySource = detail.summarySource,
            )
    }
}
