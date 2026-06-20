package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.domain.Post
import org.slf4j.LoggerFactory
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
        private val log = LoggerFactory.getLogger(FeedPostDto::class.java)
        private const val FALLBACK_PROFILE_IMAGE_URL = "https://placehold.co/600x600?text=U_U"
        private const val FALLBACK_SUMMARY = "미리보기를 불러오지 못했습니다."

        fun from(post: Post): FeedPostDto =
            runCatching {
                val meta = PostMetaExtractor.extract(post.content)
                val preview = PostPreviewExtractor.extract(post.content)

                FeedPostDto(
                    id = post.id,
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
            }.getOrElse { exception ->
                log.error("FeedPostDto mapping failed. postId={}", post.id, exception)

                FeedPostDto(
                    id = post.id,
                    createdAt = post.createdAt,
                    modifiedAt = post.modifiedAt,
                    authorId = runCatching { post.author.id }.getOrDefault(0),
                    authorName = runCatching { post.author.name }.getOrDefault("unknown"),
                    authorUsername = runCatching { post.author.username }.getOrDefault("unknown"),
                    authorProfileImgUrl =
                        runCatching { post.author.profileImgUrlVersionedOrDefault }
                            .getOrDefault(FALLBACK_PROFILE_IMAGE_URL),
                    title = runCatching { post.title }.getOrDefault("제목 없음"),
                    thumbnail = null,
                    summary = FALLBACK_SUMMARY,
                    tags = emptyList(),
                    category = emptyList(),
                    published = post.published,
                    listed = post.listed,
                    likesCount = runCatching { post.likesCount }.getOrDefault(0),
                    commentsCount = runCatching { post.commentsCount }.getOrDefault(0),
                    hitCount = runCatching { post.hitCount }.getOrDefault(0),
                )
            }
    }
}
