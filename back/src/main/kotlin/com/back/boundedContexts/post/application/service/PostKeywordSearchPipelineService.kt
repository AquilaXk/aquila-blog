package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.PostMetaExtractor
import com.back.standard.dto.page.PagedResult
import com.back.standard.dto.post.type1.PostSearchSortType1
import io.micrometer.core.instrument.MeterRegistry
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.max

/**
 * PostKeywordSearchPipelineService는 공개 검색(kw) 랭킹 파이프라인을 전담한다.
 * weighted A/B + shadow-read 비교 + 즉시 롤백(force-control) 플래그를 제공한다.
 */
@Service
class PostKeywordSearchPipelineService(
    @Value("\${custom.post.search.pipeline.enabled:true}")
    enabled: Boolean,
    @Value("\${custom.post.search.pipeline.candidatePoolSize:260}")
    candidatePoolSize: Int,
    @Value("\${custom.post.search.pipeline.maxRerankPages:6}")
    maxRerankPages: Int,
    @Value("\${custom.post.search.pipeline.rollback.forceControl:false}")
    private val forceControlProfile: Boolean,
    @Value("\${custom.post.search.pipeline.ab.enabled:true}")
    private val abEnabled: Boolean,
    @Value("\${custom.post.search.pipeline.ab.variantTrafficPercent:25}")
    variantTrafficPercent: Int,
    @Value("\${custom.post.search.pipeline.control.titleWeight:300}")
    controlTitleWeight: Double,
    @Value("\${custom.post.search.pipeline.control.tagWeight:120}")
    controlTagWeight: Double,
    @Value("\${custom.post.search.pipeline.control.contentWeight:40}")
    controlContentWeight: Double,
    @Value("\${custom.post.search.pipeline.control.freshnessWeight:1.0}")
    controlFreshnessWeight: Double,
    @Value("\${custom.post.search.pipeline.variant.titleWeight:260}")
    variantTitleWeight: Double,
    @Value("\${custom.post.search.pipeline.variant.tagWeight:180}")
    variantTagWeight: Double,
    @Value("\${custom.post.search.pipeline.variant.contentWeight:70}")
    variantContentWeight: Double,
    @Value("\${custom.post.search.pipeline.variant.freshnessWeight:1.1}")
    variantFreshnessWeight: Double,
    @Value("\${custom.post.search.pipeline.shadow-read.enabled:true}")
    private val shadowReadEnabled: Boolean,
    @Value("\${custom.post.search.pipeline.shadow-read.compareTopN:20}")
    compareTopN: Int,
    @Value("\${custom.post.search.pipeline.shadow-read.warnDeltaThreshold:0.45}")
    private val warnDeltaThreshold: Double,
    @Value("\${custom.post.search.pipeline.shadow-read.external.enabled:false}")
    private val shadowExternalEnabled: Boolean,
    @Value("\${custom.post.search.pipeline.shadow-read.external.endpoint:}")
    private val shadowExternalEndpoint: String,
    @Value("\${custom.post.search.pipeline.shadow-read.external.apiKey:}")
    private val shadowExternalApiKey: String,
    @Value("\${custom.post.search.pipeline.shadow-read.external.connectTimeoutMs:300}")
    connectTimeoutMs: Long,
    @Value("\${custom.post.search.pipeline.shadow-read.external.requestTimeoutMs:800}")
    private val requestTimeoutMs: Long,
    private val objectMapper: ObjectMapper,
    private val meterRegistry: MeterRegistry? = null,
) {
    private data class SearchWeights(
        val titleWeight: Double,
        val tagWeight: Double,
        val contentWeight: Double,
        val freshnessWeight: Double,
    )

    private data class RankedPost(
        val post: Post,
        val score: Double,
    )

    private data class SearchSignals(
        val titleLower: String,
        val contentLower: String,
        val tagsLower: List<String>,
    )

    private enum class SearchProfile {
        CONTROL,
        VARIANT,
    }

    private val logger = LoggerFactory.getLogger(PostKeywordSearchPipelineService::class.java)
    private val enabled = enabled
    private val candidatePoolSize = candidatePoolSize.coerceIn(80, 800)
    private val maxRerankPages = maxRerankPages.coerceIn(1, 20)
    private val variantTrafficPercent = variantTrafficPercent.coerceIn(0, 100)
    private val compareTopN = compareTopN.coerceIn(5, 100)
    private val controlWeights =
        SearchWeights(
            titleWeight = controlTitleWeight.coerceAtLeast(0.0),
            tagWeight = controlTagWeight.coerceAtLeast(0.0),
            contentWeight = controlContentWeight.coerceAtLeast(0.0),
            freshnessWeight = controlFreshnessWeight.coerceAtLeast(0.0),
        )
    private val variantWeights =
        SearchWeights(
            titleWeight = variantTitleWeight.coerceAtLeast(0.0),
            tagWeight = variantTagWeight.coerceAtLeast(0.0),
            contentWeight = variantContentWeight.coerceAtLeast(0.0),
            freshnessWeight = variantFreshnessWeight.coerceAtLeast(0.0),
        )
    private val shadowHttpClient = sharedHttpClient(connectTimeoutMs.coerceIn(100, 5_000))
    private val runtimeForceControlOverride = AtomicReference<Boolean?>(null)

    fun setForceControlRuntime(forceControl: Boolean?) {
        runtimeForceControlOverride.set(forceControl)
    }

    fun isForceControlRuntimeOverridden(): Boolean = runtimeForceControlOverride.get() != null

    fun isForceControlEnabled(): Boolean = runtimeForceControlOverride.get() ?: forceControlProfile

    fun shouldApply(
        keyword: String,
        sort: PostSearchSortType1,
        page: Int,
    ): Boolean =
        enabled &&
            keyword.trim().isNotBlank() &&
            sort == PostSearchSortType1.CREATED_AT &&
            page in 1..maxRerankPages

    fun resolveCandidatePoolSize(pageSize: Int): Int {
        val safePageSize = pageSize.coerceIn(1, 100)
        return max(candidatePoolSize, safePageSize * maxRerankPages).coerceIn(safePageSize, 800)
    }

    fun rerank(
        keyword: String,
        candidates: List<Post>,
        page: Int,
        pageSize: Int,
        candidateTotalElements: Long,
    ): PagedResult<Post> {
        val safePage = page.coerceAtLeast(1)
        val safePageSize = pageSize.coerceIn(1, 100)
        if (candidates.isEmpty()) {
            return PagedResult(emptyList(), safePage, safePageSize, 0)
        }

        val normalizedKeyword = keyword.trim().lowercase()
        val tokens = buildKeywordTokens(normalizedKeyword)
        val signalsByPostId = candidates.associate { post -> post.id to buildSignals(post) }
        val controlRanked = rankWithProfile(candidates, signalsByPostId, tokens, controlWeights)
        val variantRanked = rankWithProfile(candidates, signalsByPostId, tokens, variantWeights)

        val assignedProfile = resolveAssignedProfile(normalizedKeyword)
        val servedRanked =
            when (assignedProfile) {
                SearchProfile.CONTROL -> controlRanked
                SearchProfile.VARIANT -> variantRanked
            }
        meterRegistry?.counter("post.search.pipeline.assignment", "profile", assignedProfile.name.lowercase())?.increment()

        if (shadowReadEnabled) {
            val shadowRanked =
                when (assignedProfile) {
                    SearchProfile.CONTROL -> variantRanked
                    SearchProfile.VARIANT -> controlRanked
                }
            compareShadowOverlap(
                source = "internal-ab",
                primaryPostIds = servedRanked.take(compareTopN).map { it.post.id },
                shadowPostIds = shadowRanked.take(compareTopN).map { it.post.id },
            )
            compareWithExternalShadow(
                keyword = normalizedKeyword,
                page = safePage,
                pageSize = safePageSize,
                primaryPostIds = servedRanked.take(compareTopN).map { it.post.id },
            )
        }

        val fromIndex = ((safePage - 1) * safePageSize).coerceAtLeast(0)
        val toIndex = minOf(fromIndex + safePageSize, servedRanked.size)
        val pageContent =
            if (fromIndex >= servedRanked.size) {
                emptyList()
            } else {
                servedRanked.subList(fromIndex, toIndex).map { it.post }
            }
        val totalElements = max(candidateTotalElements, servedRanked.size.toLong())

        return PagedResult(
            content = pageContent,
            page = safePage,
            pageSize = safePageSize,
            totalElements = totalElements,
        )
    }

    private fun resolveAssignedProfile(normalizedKeyword: String): SearchProfile {
        if (isForceControlEnabled()) return SearchProfile.CONTROL
        if (!abEnabled || variantTrafficPercent <= 0) return SearchProfile.CONTROL

        val bucket = Math.floorMod(normalizedKeyword.hashCode(), 100)
        return if (bucket < variantTrafficPercent) SearchProfile.VARIANT else SearchProfile.CONTROL
    }

    private fun buildKeywordTokens(normalizedKeyword: String): List<String> {
        val splitTokens =
            normalizedKeyword
                .split(Regex("\\s+"))
                .map(String::trim)
                .filter { it.length >= 2 }
                .distinct()
                .take(4)
        return buildList(splitTokens.size + 1) {
            add(normalizedKeyword)
            addAll(splitTokens.filterNot { it == normalizedKeyword })
        }.filter { it.isNotBlank() }
    }

    private fun buildSignals(post: Post): SearchSignals {
        val extractedTags =
            PostMetaExtractor
                .extract(post.content)
                .tags
                .asSequence()
                .map(String::trim)
                .filter(String::isNotBlank)
                .map(String::lowercase)
                .distinct()
                .toList()
        return SearchSignals(
            titleLower = post.title.lowercase(),
            contentLower = post.content.lowercase(),
            tagsLower = extractedTags,
        )
    }

    private fun rankWithProfile(
        candidates: List<Post>,
        signalsByPostId: Map<Long, SearchSignals>,
        tokens: List<String>,
        weights: SearchWeights,
    ): List<RankedPost> {
        val now = Instant.now()
        return candidates
            .asSequence()
            .map { post ->
                val signals = signalsByPostId[post.id] ?: buildSignals(post)
                val score = score(post, signals, tokens, weights, now)
                RankedPost(post, score)
            }.sortedWith(
                compareByDescending<RankedPost> { it.score }
                    .thenByDescending { it.post.createdAt }
                    .thenByDescending { it.post.id },
            ).toList()
    }

    private fun score(
        post: Post,
        signals: SearchSignals,
        tokens: List<String>,
        weights: SearchWeights,
        now: Instant,
    ): Double {
        val titleHitCount = tokens.count { token -> signals.titleLower.contains(token) }
        val tagHitCount = tokens.count { token -> signals.tagsLower.any { tag -> tag.contains(token) } }
        val contentHitCount = tokens.count { token -> signals.contentLower.contains(token) }

        val ageHours = Duration.between(post.createdAt, now).toHours().coerceAtLeast(0)
        val freshnessTier =
            when {
                ageHours <= 6 -> 24.0
                ageHours <= 24 -> 18.0
                ageHours <= 72 -> 12.0
                ageHours <= 168 -> 6.0
                else -> 2.0
            }

        return (titleHitCount * weights.titleWeight) +
            (tagHitCount * weights.tagWeight) +
            (contentHitCount * weights.contentWeight) +
            (freshnessTier * weights.freshnessWeight)
    }

    private fun compareShadowOverlap(
        source: String,
        primaryPostIds: List<Long>,
        shadowPostIds: List<Long>,
    ) {
        if (primaryPostIds.isEmpty() || shadowPostIds.isEmpty()) return
        val primarySet = primaryPostIds.toSet()
        val shadowSet = shadowPostIds.toSet()
        val unionSize = (primarySet + shadowSet).size.coerceAtLeast(1)
        val intersectionSize = primarySet.intersect(shadowSet).size
        val delta = 1.0 - (intersectionSize.toDouble() / unionSize.toDouble())

        meterRegistry?.summary("post.search.pipeline.shadow.delta", "source", source)?.record(delta)
        if (delta >= warnDeltaThreshold) {
            meterRegistry?.counter("post.search.pipeline.shadow.warn", "source", source)?.increment()
            logger.warn(
                "post_search_shadow_delta_high source={} delta={} primaryTop={} shadowTop={}",
                source,
                String.format("%.3f", delta),
                primaryPostIds.joinToString(","),
                shadowPostIds.joinToString(","),
            )
        }
    }

    private fun compareWithExternalShadow(
        keyword: String,
        page: Int,
        pageSize: Int,
        primaryPostIds: List<Long>,
    ) {
        if (!shadowExternalEnabled || shadowExternalEndpoint.isBlank()) return
        if (primaryPostIds.isEmpty()) return

        val requestBody =
            objectMapper.writeValueAsString(
                mapOf(
                    "keyword" to keyword,
                    "page" to page,
                    "pageSize" to pageSize,
                ),
            )
        val requestBuilder =
            HttpRequest
                .newBuilder()
                .uri(URI.create(shadowExternalEndpoint))
                .timeout(Duration.ofMillis(requestTimeoutMs.coerceIn(200, 3_000)))
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
        if (shadowExternalApiKey.isNotBlank()) {
            requestBuilder.header("Authorization", "Bearer $shadowExternalApiKey")
        }

        val startedAtNanos = System.nanoTime()
        runCatching {
            shadowHttpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofString())
        }.onSuccess { response ->
            val elapsedMs = (System.nanoTime() - startedAtNanos).coerceAtLeast(0L) / 1_000_000
            meterRegistry?.timer("post.search.pipeline.shadow.external.duration")?.record(elapsedMs, TimeUnit.MILLISECONDS)

            if (response.statusCode() !in 200..299) {
                meterRegistry?.counter("post.search.pipeline.shadow.external.result", "status", "non_success")?.increment()
                logger.warn(
                    "post_search_shadow_external_non_success status={} body={}",
                    response.statusCode(),
                    response.body().take(200),
                )
                return@onSuccess
            }

            val shadowIds = parseExternalShadowIds(response.body())
            if (shadowIds.isEmpty()) {
                meterRegistry?.counter("post.search.pipeline.shadow.external.result", "status", "empty")?.increment()
                return@onSuccess
            }

            meterRegistry?.counter("post.search.pipeline.shadow.external.result", "status", "success")?.increment()
            compareShadowOverlap("external", primaryPostIds, shadowIds.take(compareTopN))
        }.onFailure { exception ->
            val elapsedMs = (System.nanoTime() - startedAtNanos).coerceAtLeast(0L) / 1_000_000
            meterRegistry?.timer("post.search.pipeline.shadow.external.duration")?.record(elapsedMs, TimeUnit.MILLISECONDS)
            meterRegistry?.counter("post.search.pipeline.shadow.external.result", "status", "failed")?.increment()
            logger.warn("post_search_shadow_external_failed message={}", exception.message ?: exception::class.simpleName)
        }
    }

    private fun parseExternalShadowIds(rawBody: String): List<Long> =
        runCatching {
            val node = objectMapper.readTree(rawBody)
            when {
                node.isArray ->
                    node
                        .mapNotNull { child -> child.asLong().takeIf { it > 0 } }
                node.isObject && node.has("postIds") ->
                    node
                        .path("postIds")
                        .mapNotNull { child -> child.asLong().takeIf { it > 0 } }
                else -> emptyList()
            }
        }.getOrElse { emptyList() }

    companion object {
        private val SHARED_HTTP_CLIENTS = ConcurrentHashMap<Long, HttpClient>()

        private fun sharedHttpClient(connectTimeoutMs: Long): HttpClient =
            SHARED_HTTP_CLIENTS.computeIfAbsent(connectTimeoutMs) { timeoutMs ->
                HttpClient
                    .newBuilder()
                    .connectTimeout(Duration.ofMillis(timeoutMs))
                    .build()
            }
    }
}
