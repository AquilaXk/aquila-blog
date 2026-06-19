package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.dto.CursorFeedPageDto
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.PublicPostsBootstrapDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class PostPublicReadEtagSeedBuilder {
    fun buildFeedPageEtagSeed(
        source: String,
        page: Int,
        pageSize: Int,
        sort: PostSearchSortType1,
        kw: String = "",
        tag: String = "",
        data: PageDto<FeedPostDto>,
    ): String {
        val itemsToken = buildFeedItemsToken(data.content)
        return buildString {
            append(source)
            append("|page=")
            append(page)
            append("|size=")
            append(pageSize)
            append("|sort=")
            append(sort.name)
            append("|kw=")
            append(kw.trim())
            append("|tag=")
            append(tag.trim())
            append("|total=")
            append(data.pageable.totalElements)
            append("|pages=")
            append(data.pageable.totalPages)
            append("|items=")
            append(itemsToken)
        }
    }

    fun buildCursorFeedEtagSeed(
        source: String,
        pageSize: Int,
        sort: PostSearchSortType1,
        cursor: String?,
        tag: String = "",
        data: CursorFeedPageDto,
    ): String {
        val itemsToken = buildFeedItemsToken(data.content)
        return buildString {
            append(source)
            append("|size=")
            append(pageSize)
            append("|sort=")
            append(sort.name)
            append("|cursor=")
            append(cursor?.trim().orEmpty())
            append("|tag=")
            append(tag.trim())
            append("|hasNext=")
            append(data.hasNext)
            append("|nextCursor=")
            append(data.nextCursor.orEmpty())
            append("|items=")
            append(itemsToken)
        }
    }

    fun buildPublicDetailEtagSeed(data: PostWithContentDto): String =
        buildString {
            append(data.id)
            append("|")
            append(toEpochMillis(data.modifiedAt))
            append("|")
            append(data.version)
            append("|")
            append(data.likesCount)
            append("|")
            append(data.commentsCount)
            append("|")
            append(data.hitCount)
            append("|author=")
            append(
                buildLengthPrefixedToken(
                    data.authorId.toString(),
                    data.authorName,
                    data.authorUsername,
                    data.authorProfileImageUrl,
                    data.authorProfileImageDirectUrl,
                ),
            )
        }

    fun buildTagsEtagSeed(tags: List<TagCountDto>): String = tags.joinToString(separator = "|") { "${it.tag}:${it.count}" }

    fun buildRelatedAuthorEtagSeed(
        authorId: Long,
        excludePostId: Long?,
        limit: Int,
        posts: List<FeedPostDto>,
    ): String {
        val itemsToken = buildFeedItemsToken(posts)
        return buildString {
            append("related-author")
            append("|authorId=")
            append(authorId)
            append("|excludePostId=")
            append(excludePostId ?: 0L)
            append("|limit=")
            append(limit)
            append("|items=")
            append(itemsToken)
        }
    }

    fun buildBootstrapEtagSeed(
        pageSize: Int,
        sort: PostSearchSortType1,
        tag: String,
        data: PublicPostsBootstrapDto,
    ): String {
        val feedSeed =
            buildCursorFeedEtagSeed(
                source = if (tag.isBlank()) "bootstrap-feed-cursor" else "bootstrap-explore-cursor",
                pageSize = pageSize,
                sort = sort,
                cursor = null,
                tag = tag,
                data = data.feed,
            )
        val tagSeed = buildTagsEtagSeed(data.tags)
        return "$feedSeed|tags=$tagSeed"
    }

    private fun buildFeedItemsToken(posts: List<FeedPostDto>): String =
        posts.joinToString(separator = "|") {
            "${it.id}:${toEpochMillis(it.modifiedAt)}:${it.likesCount}:${it.commentsCount}:${it.hitCount}:" +
                "author=${
                    buildLengthPrefixedToken(
                        it.authorId.toString(),
                        it.authorName,
                        it.authorUsername,
                        it.authorProfileImgUrl,
                    )
                }"
        }

    private fun buildLengthPrefixedToken(vararg parts: String): String =
        parts.joinToString(separator = ",") { part ->
            "${part.length}:$part"
        }

    private fun toEpochMillis(instant: Instant): Long = instant.toEpochMilli()
}
