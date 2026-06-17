package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.dto.CursorFeedPageDto
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.PublicPostsBootstrapDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.util.Locale

@Component
class PostPublicReadResponseFactory {
    fun <T : Any> respondWithEtag(
        request: HttpServletRequest,
        response: HttpServletResponse,
        cachePolicy: PublicReadCachePolicy,
        surrogateKeys: Set<String>,
        etagSeed: String,
        startedAtNanos: Long,
        body: T,
    ): ResponseEntity<T> {
        applyPublicReadCacheHeaders(response, cachePolicy, surrogateKeys)
        val etag = toWeakEtag(etagSeed)
        response.setHeader(HttpHeaders.ETAG, etag)
        if (isNotModified(request, etag)) {
            appendServerTiming(response, "cache;desc=\"etag-304\"")
            appendOriginTiming(response, startedAtNanos, "etag-304")
            response.status = HttpServletResponse.SC_NOT_MODIFIED
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).build<T>()
        }
        appendOriginTiming(response, startedAtNanos, "etag-200")
        return ResponseEntity.ok(body)
    }

    fun <T : Any> respondNoStore(
        response: HttpServletResponse,
        cachePolicy: PublicReadCachePolicy,
        surrogateKeys: Set<String>,
        startedAtNanos: Long,
        originDescription: String,
        body: T,
    ): ResponseEntity<T> {
        applyPrivateNoStoreHeaders(response)
        response.setHeader("X-Cache-Policy", cachePolicy.name)
        applySurrogateKeyHeaders(response, surrogateKeys)
        appendServerTiming(response, "cache-policy;desc=\"${cachePolicy.name}\"")
        appendOriginTiming(response, startedAtNanos, originDescription)
        return ResponseEntity.ok(body)
    }

    fun applyPrivateNoStoreHeaders(response: HttpServletResponse) {
        response.setHeader("Cache-Control", "private, no-store, max-age=0")
    }

    fun resolveSearchReadCachePolicy(keyword: String): PublicReadCachePolicy {
        val normalized = keyword.trim()
        if (normalized.isBlank()) return PostPublicReadCachePolicies.SEARCH_DEFAULT
        if (isHighEntropyKeyword(normalized)) return PostPublicReadCachePolicies.SEARCH_NO_STORE
        if (normalized.length >= SEARCH_SHORT_TTL_KEYWORD_LENGTH) return PostPublicReadCachePolicies.SEARCH_SHORT
        return PostPublicReadCachePolicies.SEARCH_DEFAULT
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
        val itemsToken =
            data.content.joinToString(separator = "|") {
                "${it.id}:${toEpochMillis(it.modifiedAt)}:${it.likesCount}:${it.commentsCount}:${it.hitCount}"
            }
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
        val itemsToken =
            data.content.joinToString(separator = "|") {
                "${it.id}:${toEpochMillis(it.modifiedAt)}:${it.likesCount}:${it.commentsCount}:${it.hitCount}"
            }
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
        }

    fun buildTagsEtagSeed(tags: List<TagCountDto>): String = tags.joinToString(separator = "|") { "${it.tag}:${it.count}" }

    fun buildRelatedAuthorEtagSeed(
        authorId: Long,
        excludePostId: Long?,
        limit: Int,
        posts: List<FeedPostDto>,
    ): String {
        val itemsToken =
            posts.joinToString(separator = "|") {
                "${it.id}:${toEpochMillis(it.modifiedAt)}:${it.likesCount}:${it.commentsCount}:${it.hitCount}"
            }
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

    private fun applyPublicReadCacheHeaders(
        response: HttpServletResponse,
        policy: PublicReadCachePolicy,
        surrogateKeys: Set<String>,
    ) {
        val safeMaxAge = policy.maxAgeSeconds.coerceAtLeast(0)
        val safeSharedMaxAge = policy.sharedMaxAgeSeconds.coerceAtLeast(safeMaxAge)
        val safeSWR = policy.staleWhileRevalidateSeconds.coerceAtLeast(0)
        val staleIfError = (safeSharedMaxAge + safeSWR).coerceAtLeast(safeSWR)
        response.setHeader(
            "Cache-Control",
            "public, max-age=$safeMaxAge, s-maxage=$safeSharedMaxAge, stale-while-revalidate=$safeSWR, stale-if-error=$staleIfError",
        )
        response.setHeader("X-Cache-Policy", policy.name)
        applySurrogateKeyHeaders(response, surrogateKeys)
        appendServerTiming(response, "cache-policy;desc=\"${policy.name}\"")
    }

    private fun applySurrogateKeyHeaders(
        response: HttpServletResponse,
        surrogateKeys: Set<String>,
    ) {
        val normalized =
            surrogateKeys
                .asSequence()
                .map(::normalizeCacheTagToken)
                .filter { it.isNotBlank() }
                .distinct()
                .toList()
        if (normalized.isEmpty()) return
        response.setHeader("Surrogate-Key", normalized.joinToString(" "))
        response.setHeader("Cache-Tag", normalized.joinToString(","))
    }

    private fun normalizeCacheTagToken(raw: String): String =
        raw
            .trim()
            .lowercase()
            .replace(Regex("[^a-z0-9:_-]"), "-")
            .replace(Regex("-+"), "-")
            .trim('-')
            .take(MAX_CACHE_TAG_LENGTH)

    private fun appendServerTiming(
        response: HttpServletResponse,
        metric: String,
    ) {
        val current = response.getHeader("Server-Timing")
        if (current.isNullOrBlank()) {
            response.setHeader("Server-Timing", metric)
            return
        }
        response.setHeader("Server-Timing", "$current, $metric")
    }

    private fun appendOriginTiming(
        response: HttpServletResponse,
        startedAtNanos: Long,
        description: String,
    ) {
        val elapsedMs = ((System.nanoTime() - startedAtNanos).coerceAtLeast(0L)).toDouble() / 1_000_000.0
        val durationToken = String.format(Locale.US, "%.1f", elapsedMs)
        appendServerTiming(response, "origin;dur=$durationToken;desc=\"$description\"")
    }

    private fun normalizeEtagToken(raw: String): String = raw.trim().removePrefix("W/").removePrefix("w/")

    private fun toWeakEtag(seed: String): String {
        val digest =
            MessageDigest
                .getInstance("SHA-256")
                .digest(seed.toByteArray(StandardCharsets.UTF_8))
                .joinToString("") { each -> "%02x".format(each) }
                .take(32)
        return "W/\"$digest\""
    }

    private fun isNotModified(
        request: HttpServletRequest,
        etag: String,
    ): Boolean {
        val ifNoneMatch = request.getHeader(HttpHeaders.IF_NONE_MATCH)?.trim().orEmpty()
        if (ifNoneMatch.isBlank()) return false
        if (ifNoneMatch == "*") return true

        val expected = normalizeEtagToken(etag)
        return ifNoneMatch
            .split(",")
            .asSequence()
            .map { normalizeEtagToken(it) }
            .any { it == expected }
    }

    private fun isHighEntropyKeyword(keyword: String): Boolean {
        if (keyword.length >= SEARCH_NO_STORE_KEYWORD_LENGTH) return true

        val tokens = keyword.split(Regex("\\s+")).filter { it.isNotBlank() }
        if (tokens.size >= SEARCH_NO_STORE_TOKEN_COUNT) return true

        val alphaNumeric = keyword.filter { it.isLetterOrDigit() }
        if (alphaNumeric.length < SEARCH_HIGH_ENTROPY_MIN_LENGTH) return false

        val uniqueRatio =
            alphaNumeric
                .lowercase()
                .toSet()
                .size
                .toDouble() / alphaNumeric.length
        return uniqueRatio >= SEARCH_HIGH_ENTROPY_UNIQUE_RATIO_THRESHOLD
    }

    private fun toEpochMillis(instant: Instant): Long = instant.toEpochMilli()

    private companion object {
        private const val MAX_CACHE_TAG_LENGTH = 64
        private const val SEARCH_SHORT_TTL_KEYWORD_LENGTH = 16
        private const val SEARCH_NO_STORE_KEYWORD_LENGTH = 28
        private const val SEARCH_NO_STORE_TOKEN_COUNT = 4
        private const val SEARCH_HIGH_ENTROPY_MIN_LENGTH = 16
        private const val SEARCH_HIGH_ENTROPY_UNIQUE_RATIO_THRESHOLD = 0.58
    }
}

data class PublicReadCachePolicy(
    val name: String,
    val maxAgeSeconds: Int,
    val sharedMaxAgeSeconds: Int,
    val staleWhileRevalidateSeconds: Int,
    val noStore: Boolean = false,
)

object PostPublicReadCachePolicies {
    val FEED =
        PublicReadCachePolicy(
            name = "feed-max20-smax60-swr60",
            maxAgeSeconds = 20,
            sharedMaxAgeSeconds = 60,
            staleWhileRevalidateSeconds = 60,
        )
    val FEED_CURSOR =
        PublicReadCachePolicy(
            name = "feed-cursor-max20-smax60-swr60",
            maxAgeSeconds = 20,
            sharedMaxAgeSeconds = 60,
            staleWhileRevalidateSeconds = 60,
        )
    val EXPLORE =
        PublicReadCachePolicy(
            name = "explore-max20-smax60-swr60",
            maxAgeSeconds = 20,
            sharedMaxAgeSeconds = 60,
            staleWhileRevalidateSeconds = 60,
        )
    val EXPLORE_CURSOR =
        PublicReadCachePolicy(
            name = "explore-cursor-max20-smax60-swr60",
            maxAgeSeconds = 20,
            sharedMaxAgeSeconds = 60,
            staleWhileRevalidateSeconds = 60,
        )
    val SEARCH_DEFAULT =
        PublicReadCachePolicy(
            name = "search-max15-smax45-swr45",
            maxAgeSeconds = 15,
            sharedMaxAgeSeconds = 45,
            staleWhileRevalidateSeconds = 45,
        )
    val SEARCH_SHORT =
        PublicReadCachePolicy(
            name = "search-short-max5-smax10-swr15",
            maxAgeSeconds = 5,
            sharedMaxAgeSeconds = 10,
            staleWhileRevalidateSeconds = 15,
        )
    val SEARCH_NO_STORE =
        PublicReadCachePolicy(
            name = "search-high-entropy-no-store",
            maxAgeSeconds = 0,
            sharedMaxAgeSeconds = 0,
            staleWhileRevalidateSeconds = 0,
            noStore = true,
        )
    val TAGS =
        PublicReadCachePolicy(
            name = "tags-max60-smax300-swr300",
            maxAgeSeconds = 60,
            sharedMaxAgeSeconds = 300,
            staleWhileRevalidateSeconds = 300,
        )
    val BOOTSTRAP =
        PublicReadCachePolicy(
            name = "bootstrap-max20-smax60-swr60",
            maxAgeSeconds = 20,
            sharedMaxAgeSeconds = 60,
            staleWhileRevalidateSeconds = 60,
        )
    val DETAIL =
        PublicReadCachePolicy(
            name = "detail-max20-smax60-swr60",
            maxAgeSeconds = 20,
            sharedMaxAgeSeconds = 60,
            staleWhileRevalidateSeconds = 60,
        )
    val RELATED_AUTHOR =
        PublicReadCachePolicy(
            name = "related-author-max15-smax45-swr45",
            maxAgeSeconds = 15,
            sharedMaxAgeSeconds = 45,
            staleWhileRevalidateSeconds = 45,
        )
}
