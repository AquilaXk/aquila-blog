package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.dto.CursorFeedPageDto
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PublicPostsBootstrapDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.global.util.Utf8ChunkDigest
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class PostPublicReadEtagSeedBuilder {
    fun buildFeedPageWeakEtag(
        source: String,
        page: Int,
        pageSize: Int,
        sort: PostSearchSortType1,
        kw: String = "",
        tag: String = "",
        data: PageDto<FeedPostDto>,
    ): String {
        val writer = Utf8ChunkDigest.newWeakEtagWriter()
        writeFeedPageSeed(writer, source, page, pageSize, sort, kw, tag, data)
        return writer.finishWeakEtag()
    }

    fun buildCursorFeedWeakEtag(
        source: String,
        pageSize: Int,
        sort: PostSearchSortType1,
        cursor: String?,
        tag: String = "",
        data: CursorFeedPageDto,
    ): String {
        val writer = Utf8ChunkDigest.newWeakEtagWriter()
        writeCursorFeedSeed(writer, source, pageSize, sort, cursor, tag, data)
        return writer.finishWeakEtag()
    }

    fun buildTagsWeakEtag(tags: List<TagCountDto>): String {
        val writer = Utf8ChunkDigest.newWeakEtagWriter()
        writeTagsSeed(writer, tags)
        return writer.finishWeakEtag()
    }

    fun buildRelatedAuthorWeakEtag(
        authorId: Long,
        excludePostId: Long?,
        limit: Int,
        posts: List<FeedPostDto>,
    ): String {
        val writer = Utf8ChunkDigest.newWeakEtagWriter()
        writer.appendAscii("related-author|authorId=").appendLong(authorId)
        writer.appendAscii("|excludePostId=").appendLong(excludePostId ?: 0L)
        writer.appendAscii("|limit=").appendInt(limit)
        writer.appendAscii("|items=")
        writeFeedItemsToken(writer, posts)
        return writer.finishWeakEtag()
    }

    fun buildBootstrapWeakEtag(
        pageSize: Int,
        sort: PostSearchSortType1,
        tag: String,
        data: PublicPostsBootstrapDto,
    ): String {
        val writer = Utf8ChunkDigest.newWeakEtagWriter()
        writeCursorFeedSeed(
            writer = writer,
            source = if (tag.isBlank()) "bootstrap-feed-cursor" else "bootstrap-explore-cursor",
            pageSize = pageSize,
            sort = sort,
            cursor = null,
            tag = tag,
            data = data.feed,
        )
        writer.appendAscii("|tags=")
        writeTagsSeed(writer, data.tags)
        return writer.finishWeakEtag()
    }

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
            "${it.id}:${toEpochMillis(it.modifiedAt)}:${it.likesCount}:${it.hitCount}:" +
                "content=${buildNullableLengthPrefixedToken(it.title, it.thumbnail, it.summary, it.summarySource.name)}:" +
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

    private fun buildNullableLengthPrefixedToken(vararg parts: String?): String =
        parts.joinToString(separator = ",") { part ->
            if (part == null) "null" else "${part.length}:$part"
        }

    private fun toEpochMillis(instant: Instant): Long = instant.toEpochMilli()

    private fun writeFeedPageSeed(
        writer: Utf8ChunkDigest.WeakEtagDigestWriter,
        source: String,
        page: Int,
        pageSize: Int,
        sort: PostSearchSortType1,
        kw: String,
        tag: String,
        data: PageDto<FeedPostDto>,
    ) {
        writer.appendUtf8(source)
        writer.appendAscii("|page=").appendInt(page)
        writer.appendAscii("|size=").appendInt(pageSize)
        writer.appendAscii("|sort=").appendAscii(sort.name)
        writer.appendAscii("|kw=").appendTrimmedUtf8(kw)
        writer.appendAscii("|tag=").appendTrimmedUtf8(tag)
        writer.appendAscii("|total=").appendLong(data.pageable.totalElements)
        writer.appendAscii("|pages=").appendLong(data.pageable.totalPages.toLong())
        writer.appendAscii("|items=")
        writeFeedItemsToken(writer, data.content)
    }

    private fun writeCursorFeedSeed(
        writer: Utf8ChunkDigest.WeakEtagDigestWriter,
        source: String,
        pageSize: Int,
        sort: PostSearchSortType1,
        cursor: String?,
        tag: String,
        data: CursorFeedPageDto,
    ) {
        writer.appendUtf8(source)
        writer.appendAscii("|size=").appendInt(pageSize)
        writer.appendAscii("|sort=").appendAscii(sort.name)
        writer.appendAscii("|cursor=")
        if (cursor != null) writer.appendTrimmedUtf8(cursor)
        writer.appendAscii("|tag=").appendTrimmedUtf8(tag)
        writer.appendAscii("|hasNext=").appendBoolean(data.hasNext)
        writer.appendAscii("|nextCursor=")
        data.nextCursor?.let { writer.appendUtf8(it) }
        writer.appendAscii("|items=")
        writeFeedItemsToken(writer, data.content)
    }

    private fun writeTagsSeed(
        writer: Utf8ChunkDigest.WeakEtagDigestWriter,
        tags: List<TagCountDto>,
    ) {
        for (index in tags.indices) {
            if (index > 0) writer.appendChar('|')
            val item = tags[index]
            writer.appendUtf8(item.tag)
            writer.appendChar(':')
            writer.appendInt(item.count)
        }
    }

    private fun writeFeedItemsToken(
        writer: Utf8ChunkDigest.WeakEtagDigestWriter,
        posts: List<FeedPostDto>,
    ) {
        for (index in posts.indices) {
            if (index > 0) writer.appendChar('|')
            val post = posts[index]
            writer.appendLong(post.id)
            writer.appendChar(':')
            writer.appendLong(toEpochMillis(post.modifiedAt))
            writer.appendChar(':')
            writer.appendInt(post.likesCount)
            writer.appendChar(':')
            writer.appendInt(post.hitCount)
            writer.appendAscii(":content=")
            writer.appendNullableLengthPrefixedUtf8(post.title)
            writer.appendChar(',')
            writer.appendNullableLengthPrefixedUtf8(post.thumbnail)
            writer.appendChar(',')
            writer.appendNullableLengthPrefixedUtf8(post.summary)
            writer.appendChar(',')
            writer.appendNullableLengthPrefixedUtf8(post.summarySource.name)
            writer.appendAscii(":author=")
            writer.appendDecimalLengthPrefixedLong(post.authorId)
            writer.appendChar(',')
            writer.appendLengthPrefixedUtf8(post.authorName)
            writer.appendChar(',')
            writer.appendLengthPrefixedUtf8(post.authorUsername)
            writer.appendChar(',')
            writer.appendLengthPrefixedUtf8(post.authorProfileImgUrl)
        }
    }
}
