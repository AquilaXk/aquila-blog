package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.domain.Post
import java.time.Instant

data class FeedPostDto(
    val id: Int,
    val createdAt: Instant,
    val modifiedAt: Instant,
    val authorId: Int,
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
        fun from(post: Post): FeedPostDto {
            val meta = PostMetaExtractor.extract(post.content)

            return FeedPostDto(
                id = post.id,
                createdAt = post.createdAt,
                modifiedAt = post.modifiedAt,
                authorId = post.author.id,
                authorName = post.author.name,
                authorUsername = post.author.username,
                authorProfileImgUrl = post.author.redirectToProfileImgUrlOrDefault,
                title = post.title,
                thumbnail = PostPreviewExtractor.extractThumbnail(post.content),
                summary = PostPreviewExtractor.makeSummary(post.content),
                tags = meta.tags,
                category = meta.categories,
                published = post.published,
                listed = post.listed,
                likesCount = post.likesCount,
                commentsCount = post.commentsCount,
                hitCount = post.hitCount,
            )
        }
    }
}
