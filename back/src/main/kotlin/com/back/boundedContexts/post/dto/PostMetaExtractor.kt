package com.back.boundedContexts.post.dto

import com.back.global.util.StripedDigestLruCache
import com.back.global.util.Utf8ChunkDigest
import com.back.global.util.Utf8ChunkDigest.Digest128

/**
 * 마크다운 frontmatter/상단 메타 라인에서 tags/categories를 추출한다.
 *
 * 참조 구현: FasterXML/jackson-core (Apache-2.0) & commonmark/commonmark-java (BSD-2-Clause)
 * 16-stripe LRU cache partitioning (`digestHead and 15`, inspired by Apache-2.0 Guava Striped / Caffeine segments)
 * with collision-safe 128-bit digest keys from [Utf8ChunkDigest.sha256Digest128].
 * 문자열 결합(`"$frontmatterBlock\n$headerBlock"`) 재할당 없이 frontmatter 구간과 header 구간의
 * 오프셋 범위를 직접 순회하여 태그·카테고리를 추출한다.
 */
object PostMetaExtractor {
    internal const val MAX_CACHE_ENTRIES = 512

    data class PostMeta(
        val tags: List<String>,
        val categories: List<String>,
    )

    private val EMPTY_META =
        PostMeta(
            tags = emptyList(),
            categories = emptyList(),
        )

    private val metaCache = StripedDigestLruCache<PostMeta>(MAX_CACHE_ENTRIES)

    private class MetadataRanges(
        val fmStart: Int,
        val fmEnd: Int,
        val headerStart: Int,
        val headerEnd: Int,
    ) {
        val hasFm: Boolean get() = fmStart != -1 && fmStart < fmEnd
        val hasHeader: Boolean get() = headerStart != -1 && headerStart < headerEnd
        val isEmpty: Boolean get() = !hasFm && !hasHeader
    }

    fun extract(content: String): PostMeta {
        val ranges = findMetadataRanges(content)
        if (ranges.isEmpty) return EMPTY_META

        val digestKey = computeDigestKey(content, ranges)
        metaCache.get(digestKey)?.let { return it }
        val computed = buildMetaFromRanges(content, ranges)
        metaCache.put(digestKey, computed)
        return computed
    }

    internal fun clearCache() {
        metaCache.clear()
    }

    internal fun cachedEntryCount(): Int = metaCache.totalSize()

    internal fun stripeCount(): Int = metaCache.stripeCount()

    internal fun stripeEntryCounts(): IntArray = metaCache.stripeSizes()

    internal fun cacheKeyFor(metadataBlock: String): String = Utf8ChunkDigest.sha256Hex(metadataBlock)

    private fun computeDigestKey(
        content: String,
        ranges: MetadataRanges,
    ): Digest128 =
        when {
            ranges.hasFm && ranges.hasHeader ->
                Utf8ChunkDigest.sha256Digest128TwoRanges(
                    content,
                    ranges.fmStart,
                    ranges.fmEnd,
                    '\n',
                    ranges.headerStart,
                    ranges.headerEnd,
                )
            ranges.hasFm ->
                Utf8ChunkDigest.sha256Digest128Range(content, ranges.fmStart, ranges.fmEnd)
            else ->
                Utf8ChunkDigest.sha256Digest128Range(content, ranges.headerStart, ranges.headerEnd)
        }

    private fun findMetadataRanges(content: String): MetadataRanges {
        var cursor = skipLeadingWhitespace(content, 0)
        if (cursor >= content.length) return MetadataRanges(-1, -1, -1, -1)

        var fmStart = -1
        var fmEnd = -1
        val frontmatterBodyStart = openingFrontmatterBodyOffset(content, cursor)
        if (frontmatterBodyStart != -1) {
            val closingIndex = content.indexOf("\n---", startIndex = frontmatterBodyStart)
            if (closingIndex > 0) {
                fmStart = frontmatterBodyStart
                fmEnd = closingIndex
                cursor = skipLeadingWhitespace(content, closingIndex + 4)
            }
        }

        var headerStart = -1
        var headerEnd = -1
        while (cursor < content.length) {
            val newlineIndex = content.indexOf('\n', startIndex = cursor)
            val lineEnd = if (newlineIndex == -1) content.length else newlineIndex
            val colonIndex = content.indexOf(':', startIndex = cursor)
            if (colonIndex !in cursor until lineEnd) break
            if (PostHeaderMetadataMatcher.matchLine(content, cursor, lineEnd, colonIndex) ==
                PostHeaderMetadataMatcher.KIND_NONE
            ) {
                break
            }
            if (headerStart == -1) {
                headerStart = cursor
            }
            headerEnd = lineEnd
            cursor = lineEnd + 1
        }

        return MetadataRanges(
            fmStart = fmStart,
            fmEnd = fmEnd,
            headerStart = headerStart,
            headerEnd = headerEnd,
        )
    }

    private fun openingFrontmatterBodyOffset(
        content: String,
        cursor: Int,
    ): Int =
        when {
            content.startsWith("---\n", startIndex = cursor) -> cursor + 4
            content.startsWith("---\r\n", startIndex = cursor) -> cursor + 5
            else -> -1
        }

    private fun skipLeadingWhitespace(
        text: String,
        startIndex: Int,
    ): Int {
        var index = startIndex
        while (index < text.length && PostHeaderMetadataMatcher.isWhitespace(text[index])) {
            index += 1
        }
        return index
    }

    private fun buildMetaFromRanges(
        content: String,
        ranges: MetadataRanges,
    ): PostMeta {
        val tags = linkedSetOf<String>()
        val categories = linkedSetOf<String>()

        if (ranges.hasFm) {
            scanMetaLines(content, ranges.fmStart, ranges.fmEnd, tags, categories)
        }
        if (ranges.hasHeader) {
            scanMetaLines(content, ranges.headerStart, ranges.headerEnd, tags, categories)
        }

        return PostMeta(
            tags = tags.toList(),
            categories = categories.toList(),
        )
    }

    private fun scanMetaLines(
        content: String,
        startOffset: Int,
        endOffset: Int,
        tags: MutableCollection<String>,
        categories: MutableCollection<String>,
    ) {
        var cursor = startOffset
        while (cursor < endOffset) {
            val newlineIndex = content.indexOf('\n', startIndex = cursor)
            val lineEnd = if (newlineIndex == -1 || newlineIndex > endOffset) endOffset else newlineIndex
            val colonIndex = content.indexOf(':', startIndex = cursor)
            if (colonIndex > cursor && colonIndex < lineEnd) {
                when (PostHeaderMetadataMatcher.matchKeyKind(content, cursor, colonIndex)) {
                    PostHeaderMetadataMatcher.KIND_TAG ->
                        collectMetaItems(content, colonIndex + 1, lineEnd, tags)
                    PostHeaderMetadataMatcher.KIND_CATEGORY ->
                        collectMetaItems(content, colonIndex + 1, lineEnd, categories)
                }
            }
            cursor = lineEnd + 1
        }
    }

    private fun collectMetaItems(
        text: String,
        valueStart: Int,
        valueEnd: Int,
        sink: MutableCollection<String>,
    ) {
        var blockStart = valueStart
        var blockEnd = valueEnd
        while (blockStart < blockEnd && PostHeaderMetadataMatcher.isWhitespace(text[blockStart])) blockStart++
        while (blockEnd > blockStart && PostHeaderMetadataMatcher.isWhitespace(text[blockEnd - 1])) blockEnd--
        if (blockStart < blockEnd && text[blockStart] == '[') blockStart++
        if (blockEnd > blockStart && text[blockEnd - 1] == ']') blockEnd--

        var start = blockStart
        while (start <= blockEnd) {
            val rawComma = text.indexOf(',', startIndex = start)
            val itemEnd = if (rawComma == -1 || rawComma >= blockEnd) blockEnd else rawComma
            val token = PostHeaderMetadataMatcher.unquoteTrimmed(text, start, itemEnd)
            if (token != null) {
                sink.add(token)
            }
            if (rawComma == -1 || rawComma >= blockEnd) break
            start = rawComma + 1
        }
    }
}
