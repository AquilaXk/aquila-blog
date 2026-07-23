package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.domain.Post
import java.time.Instant

data class FeedPostDto(
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
    val tags: List<String>,
    val category: List<String>,
    val published: Boolean,
    val listed: Boolean,
    val likesCount: Int,
    val commentsCount: Int,
    val hitCount: Int,
) {
    companion object {
        private const val UNAVAILABLE_SUMMARY = "미리보기를 불러오지 못했습니다."

        fun from(
            post: Post,
            reportFailure: FeedPostDtoMappingFailureReporter = { _, _, _ -> },
        ): FeedPostDto {
            val postId = post.id
            val content = post.content
            val meta = extractMeta(postId, content, reportFailure)
            val preview = extractPreview(postId, content, reportFailure)

            return FeedPostDto(
                id = postId,
                createdAt = post.createdAt,
                modifiedAt = post.modifiedAt,
                authorId = post.author.id,
                authorName = post.author.name,
                authorUsername = post.author.username,
                authorProfileImgUrl = post.author.profileImgUrlVersionedOrDefault,
                title = post.title,
                thumbnail = preview.thumbnail,
                summary = preview.summary,
                tags = meta.tags,
                category = meta.categories,
                published = post.published,
                listed = post.listed,
                likesCount = post.likesCount,
                commentsCount = post.commentsCount,
                hitCount = post.hitCount,
            )
        }

        private fun extractMeta(
            postId: Long,
            content: String,
            reportFailure: FeedPostDtoMappingFailureReporter,
        ): PostMetaExtractor.PostMeta =
            runCatching {
                PostMetaExtractor.extract(content)
            }.getOrElse { exception ->
                reportFailure(postId, FeedPostDtoMappingFailureType.META, exception)
                PostMetaExtractor.PostMeta(
                    tags = emptyList(),
                    categories = emptyList(),
                )
            }

        private fun extractPreview(
            postId: Long,
            content: String,
            reportFailure: FeedPostDtoMappingFailureReporter,
        ): PostPreviewExtractor.Preview =
            runCatching {
                PostPreviewExtractor.extract(content)
            }.getOrElse { exception ->
                reportFailure(postId, FeedPostDtoMappingFailureType.PREVIEW, exception)
                PostPreviewExtractor.Preview(
                    thumbnail = null,
                    summary = UNAVAILABLE_SUMMARY,
                )
            }
    }
}

enum class FeedPostDtoMappingFailureType(
    val metricTag: String,
) {
    PREVIEW("preview"),
    META("meta"),
    CORE("core"),
}

typealias FeedPostDtoMappingFailureReporter = (
    postId: Long,
    failureType: FeedPostDtoMappingFailureType,
    exception: Throwable,
) -> Unit
