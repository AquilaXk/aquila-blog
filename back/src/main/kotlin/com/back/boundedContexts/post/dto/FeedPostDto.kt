package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.model.PostSummarySource
import io.swagger.v3.oas.annotations.media.Schema
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
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val summary: String,
    @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    val summarySource: PostSummarySource,
    val tags: List<String>,
    val category: List<String>,
    val published: Boolean,
    val listed: Boolean,
    val likesCount: Int,
    val hitCount: Int,
) {
    companion object {
        fun from(
            post: Post,
            reportFailure: FeedPostDtoMappingFailureReporter = { _, _, _ -> },
        ): FeedPostDto {
            val postId = post.id
            val content = post.content
            val meta = extractMeta(postId, content, reportFailure)
            val thumbnail = extractThumbnail(postId, content, reportFailure)

            return FeedPostDto(
                id = postId,
                createdAt = post.createdAt,
                modifiedAt = post.modifiedAt,
                authorId = post.author.id,
                authorName = post.author.name,
                authorUsername = post.author.name,
                authorProfileImgUrl = post.author.profileImgUrlVersionedOrDefault,
                title = post.title,
                thumbnail = thumbnail,
                summary = post.summaryText.orEmpty(),
                summarySource = post.summarySource,
                tags = meta.tags,
                category = meta.categories,
                published = post.published,
                listed = post.listed,
                likesCount = post.likesCount,
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

        private fun extractThumbnail(
            postId: Long,
            content: String,
            reportFailure: FeedPostDtoMappingFailureReporter,
        ): String? =
            runCatching {
                PostPreviewExtractor.extractThumbnail(content)
            }.getOrElse { exception ->
                reportFailure(postId, FeedPostDtoMappingFailureType.PREVIEW, exception)
                null
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
