package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.input.PostTagRecommendationUseCase
import com.back.boundedContexts.post.dto.PostMetaExtractor
import com.back.boundedContexts.post.dto.PostTagRecommendationResult
import com.back.global.cache.application.port.output.RedisKeyValuePort
import io.micrometer.core.instrument.MeterRegistry
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.ArrayDeque
import java.util.LinkedHashMap
import kotlin.random.Random

/**
 * PostTagRecommendationService는 관리자 글 작성 시 AI 태그 추천을 제공하는 애플리케이션 서비스입니다.
 * AI 실패 시 규칙 기반 추천으로 fail-open 하여 작성 흐름이 중단되지 않도록 유지합니다.
 */
@Service
class PostTagRecommendationService(
    @param:Value("\${custom.ai.tag.enabled:true}")
    private val aiTagEnabled: Boolean,
    @param:Value("\${custom.ai.tag.timeoutSeconds:6}")
    private val timeoutSeconds: Long,
    @param:Value("\${custom.ai.tag.maxRequestsPerMinute:30}")
    private val maxRequestsPerMinute: Int,
    @param:Value("\${custom.ai.tag.maxRequestsPerDay:1000}")
    private val maxRequestsPerDay: Int,
    @param:Value("\${custom.ai.tag.cacheTtlSeconds:300}")
    private val cacheTtlSeconds: Long,
    @param:Value("\${custom.ai.tag.fallbackCacheTtlSeconds:45}")
    private val fallbackCacheTtlSeconds: Long,
    @param:Value("\${custom.ai.tag.retryMaxAttempts:1}")
    private val retryMaxAttempts: Int,
    @param:Value("\${custom.ai.tag.retryDelayMs:250}")
    private val retryDelayMs: Long,
    @param:Value("\${custom.ai.tag.maxTagLength:24}")
    private val maxTagLength: Int,
    @param:Value("\${custom.ai.tag.gemini.apiKey:}")
    private val geminiApiKey: String,
    @param:Value("\${custom.ai.tag.gemini.model:gemini-2.5-flash}")
    private val geminiModel: String,
    @param:Value("\${custom.ai.tag.gemini.baseUrl:https://generativelanguage.googleapis.com/v1beta}")
    private val geminiBaseUrl: String,
    private val redisKeyValuePort: RedisKeyValuePort,
    private val objectMapper: ObjectMapper,
    private val meterRegistry: MeterRegistry? = null,
) : PostTagRecommendationUseCase {
    private data class CacheEntry(
        val result: PostTagRecommendationResult,
        val expiresAtMillis: Long,
    )

    private data class ParsedResponse(
        val tags: List<String>,
        val modelVersion: String?,
    )

    private data class GeminiResponse(
        val statusCode: Int,
        val body: String,
    )

    private class GeminiTransportException(
        message: String,
    ) : RuntimeException(message)

    private class GeminiStatusException(
        val status: Int,
        val bodyPreview: String,
    ) : RuntimeException("status=$status")

    private val log = LoggerFactory.getLogger(javaClass)
    private val zoneId: ZoneId = ZoneId.systemDefault()
    private val httpClient = SHARED_HTTP_CLIENT

    private val normalizedTimeoutSeconds = timeoutSeconds.coerceIn(3, 15)
    private val normalizedMinuteLimit = maxRequestsPerMinute.coerceIn(1, 500)
    private val normalizedDayLimit = maxRequestsPerDay.coerceIn(10, 500_000)
    private val normalizedCacheTtlSeconds = cacheTtlSeconds.coerceIn(10, 3_600)
    private val normalizedFallbackCacheTtlSeconds = fallbackCacheTtlSeconds.coerceIn(10, 600)
    private val normalizedRetryMaxAttempts = retryMaxAttempts.coerceIn(0, 3)
    private val normalizedRetryDelayMs = retryDelayMs.coerceIn(100, 2_000)
    private val normalizedMaxTagLength = maxTagLength.coerceIn(10, 40)
    private val normalizedGeminiBaseUrl = sanitizeGeminiBaseUrl(geminiBaseUrl)

    private val cacheLock = Any()
    private val recommendationCache =
        object : LinkedHashMap<String, CacheEntry>(CACHE_MAX_ENTRIES, 0.75f, true) {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, CacheEntry>): Boolean = size > CACHE_MAX_ENTRIES
        }

    private val fallbackLimitLock = Any()
    private val recentRequestTimestamps = ArrayDeque<Long>()
    private var usageDate: LocalDate = LocalDate.now(zoneId)
    private var usageCount: Int = 0

    override fun recommend(
        title: String,
        content: String,
        existingTags: List<String>,
        maxTags: Int,
    ): PostTagRecommendationResult {
        val normalizedMaxTags = maxTags.coerceIn(3, 10)
        val normalizedTitle = title.trim()
        val normalizedContent = content.trim()
        val normalizedExistingTags = sanitizeTags(existingTags, normalizedMaxTags * 2)
        val fallbackTags = buildRuleTags(normalizedTitle, normalizedContent, normalizedExistingTags, normalizedMaxTags)
        val traceId = newTraceId()
        val cacheKey = recommendationCacheKey(normalizedTitle, normalizedContent, normalizedExistingTags, normalizedMaxTags)
        val now = System.currentTimeMillis()

        fun done(result: PostTagRecommendationResult): PostTagRecommendationResult {
            val traced = result.copy(traceId = traceId)
            log.info(
                "tag_recommend trace={} provider={} reason={} tagsCount={}",
                traceId,
                traced.provider,
                traced.reason ?: "-",
                traced.tags.size,
            )
            recordMetrics(traced.provider, traced.reason)
            return traced
        }

        readCache(cacheKey, now)?.let {
            return done(it)
        }

        if (!aiTagEnabled) {
            return done(
                fallbackAndCache(
                    cacheKey = cacheKey,
                    tags = fallbackTags,
                    reason = "ai-disabled",
                    nowMillis = now,
                ),
            )
        }

        val apiKey = geminiApiKey.trim()
        if (apiKey.isBlank()) {
            return done(
                fallbackAndCache(
                    cacheKey = cacheKey,
                    tags = fallbackTags,
                    reason = "api-key-missing",
                    nowMillis = now,
                ),
            )
        }

        if (!allowRequest(now)) {
            return done(
                fallbackAndCache(
                    cacheKey = cacheKey,
                    tags = fallbackTags,
                    reason = "rate-limited",
                    nowMillis = now,
                ),
            )
        }

        return try {
            val parsed = requestGeminiWithRetry(apiKey, normalizedTitle, normalizedContent, normalizedMaxTags)
            val aiTags = sanitizeTags(parsed.tags + normalizedExistingTags, normalizedMaxTags)
            if (aiTags.isEmpty()) {
                done(
                    fallbackAndCache(
                        cacheKey = cacheKey,
                        tags = fallbackTags,
                        reason = "empty-tags",
                        nowMillis = now,
                    ),
                )
            } else {
                val success =
                    PostTagRecommendationResult(
                        tags = aiTags,
                        provider = "gemini",
                        model = parsed.modelVersion ?: sanitizeModel(geminiModel),
                    )
                writeCache(cacheKey, success, normalizedCacheTtlSeconds, now)
                done(success)
            }
        } catch (statusException: GeminiStatusException) {
            val reason =
                if (statusException.status == 429) {
                    "quota-exhausted"
                } else {
                    "status-${statusException.status}"
                }
            log.warn(
                "tag_recommend status fallback status={} body={}",
                statusException.status,
                statusException.bodyPreview,
            )
            done(
                fallbackAndCache(
                    cacheKey = cacheKey,
                    tags = fallbackTags,
                    reason = reason,
                    nowMillis = now,
                ),
            )
        } catch (transportException: GeminiTransportException) {
            log.warn("tag_recommend transport fallback: {}", transportException.message)
            done(
                fallbackAndCache(
                    cacheKey = cacheKey,
                    tags = fallbackTags,
                    reason = "transport",
                    nowMillis = now,
                ),
            )
        } catch (exception: Exception) {
            log.error("tag_recommend internal fallback", exception)
            done(
                fallbackAndCache(
                    cacheKey = cacheKey,
                    tags = fallbackTags,
                    reason = "internal-error",
                    nowMillis = now,
                ),
            )
        }
    }

    private fun requestGeminiWithRetry(
        apiKey: String,
        title: String,
        content: String,
        maxTags: Int,
    ): ParsedResponse {
        var attempt = 0
        var lastTransportError: GeminiTransportException? = null

        while (attempt <= normalizedRetryMaxAttempts) {
            if (attempt > 0) {
                try {
                    Thread.sleep(normalizedRetryDelayMs * attempt)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    break
                }
            }

            try {
                val response = requestGemini(apiKey, title, content, maxTags)
                if (response.statusCode !in 200..299) {
                    throw GeminiStatusException(response.statusCode, previewText(response.body))
                }
                return parseGeminiResponse(response.body, maxTags)
            } catch (statusException: GeminiStatusException) {
                if (statusException.status in 400..499 || attempt >= normalizedRetryMaxAttempts) {
                    throw statusException
                }
                attempt += 1
            } catch (transportException: GeminiTransportException) {
                lastTransportError = transportException
                if (attempt >= normalizedRetryMaxAttempts) {
                    break
                }
                attempt += 1
            }
        }

        throw lastTransportError ?: GeminiTransportException("gemini transport failed without detail")
    }

    private fun requestGemini(
        apiKey: String,
        title: String,
        content: String,
        maxTags: Int,
    ): GeminiResponse {
        val requestBody = buildGeminiRequestBody(title, content, maxTags)
        val endpoint = "$normalizedGeminiBaseUrl/models/${sanitizeModel(geminiModel)}:generateContent"
        val uri = URI.create("$endpoint?key=$apiKey")

        val request =
            HttpRequest
                .newBuilder(uri)
                .timeout(Duration.ofSeconds(normalizedTimeoutSeconds))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .build()

        return try {
            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            GeminiResponse(statusCode = response.statusCode(), body = response.body())
        } catch (exception: Exception) {
            throw GeminiTransportException(exception.message ?: exception::class.java.simpleName)
        }
    }

    private fun buildGeminiRequestBody(
        title: String,
        content: String,
        maxTags: Int,
    ): String {
        val prompt =
            buildList {
                add("역할: 기술 블로그 글에서 검색/탐색에 유용한 태그를 추천하는 시스템")
                add("목표: 본문 핵심 주제를 반영한 태그를 JSON으로만 출력")
                add("출력규칙:")
                add("- 반드시 JSON 객체 1개만 반환")
                add("- 형식: {\"tags\":[\"tag1\",\"tag2\",...]} ")
                add("- 태그 개수: 3~$maxTags")
                add("- 각 태그는 2~${normalizedMaxTagLength}자")
                add("- 태그는 중복 금지, '#', 줄바꿈, URL 금지")
                add("- 너무 일반적인 태그(예: 개발, 블로그) 남발 금지")
                add("")
                add("<입력데이터>")
                add("제목: ${title.take(MAX_TITLE_LENGTH)}")
                add("본문:")
                add(sanitizePromptContent(content))
            }.joinToString("\n")

        val payload =
            mapOf(
                "contents" to
                    listOf(
                        mapOf(
                            "role" to "user",
                            "parts" to listOf(mapOf("text" to prompt)),
                        ),
                    ),
                "generationConfig" to
                    mapOf(
                        "temperature" to 0.2,
                        "topP" to 0.9,
                        "responseMimeType" to "application/json",
                    ),
            )
        return objectMapper.writeValueAsString(payload)
    }

    private fun parseGeminiResponse(
        rawBody: String,
        maxTags: Int,
    ): ParsedResponse {
        val root = objectMapper.readTree(rawBody)
        val modelVersionNode = root.path("modelVersion")
        val modelVersion =
            modelVersionNode
                .takeIf { !it.isMissingNode && !it.isNull }
                ?.asText()
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
        val textCandidates = extractTextCandidates(root)
        val firstMeaningful = textCandidates.firstOrNull { it.isNotBlank() } ?: throw GeminiTransportException("empty response text")
        val parsedTags = parseTagsPayload(firstMeaningful)
        val sanitizedTags = sanitizeTags(parsedTags, maxTags)
        if (sanitizedTags.isEmpty()) {
            throw GeminiTransportException("empty tags after parse")
        }
        return ParsedResponse(tags = sanitizedTags, modelVersion = modelVersion)
    }

    private fun extractTextCandidates(root: JsonNode): List<String> {
        val candidates = mutableListOf<String>()
        root.path("candidates").forEach { candidate ->
            candidate.path("content").path("parts").forEach { part ->
                val text = part.path("text").asText("").trim()
                if (text.isNotBlank()) {
                    candidates += text
                }
            }
        }
        return candidates
    }

    private fun parseTagsPayload(rawText: String): List<String> {
        val cleaned = stripCodeFence(rawText)

        runCatching {
            val node = objectMapper.readTree(cleaned)
            return parseTagsFromJsonNode(node)
        }

        return cleaned
            .replace("[", " ")
            .replace("]", " ")
            .split(",", "\n")
            .map { normalizeTag(it) }
            .filter { it.isNotEmpty() }
    }

    private fun parseTagsFromJsonNode(node: JsonNode): List<String> {
        if (node.isArray) {
            return node.mapNotNull { child -> child.takeIf { it.isTextual }?.asText()?.trim()?.takeIf { it.isNotEmpty() } }
        }
        if (!node.isObject) return emptyList()

        val direct = node.path("tags")
        if (direct.isArray) {
            return direct.mapNotNull { child -> child.takeIf { it.isTextual }?.asText()?.trim()?.takeIf { it.isNotEmpty() } }
        }

        val nested = node.path("data").path("tags")
        if (nested.isArray) {
            return nested.mapNotNull { child -> child.takeIf { it.isTextual }?.asText()?.trim()?.takeIf { it.isNotEmpty() } }
        }

        return emptyList()
    }

    private fun buildRuleTags(
        title: String,
        content: String,
        existingTags: List<String>,
        maxTags: Int,
    ): List<String> {
        val existing = sanitizeTags(existingTags, maxTags * 2)
        val frontmatterTags = PostMetaExtractor.extract(content).tags
        val weighted = linkedMapOf<String, Int>()

        fun addTokens(
            source: String,
            weight: Int,
        ) {
            tokenize(source).forEach { token ->
                val normalized = normalizeTag(token)
                if (normalized.isEmpty()) return@forEach
                if (STOPWORDS.contains(normalized.lowercase())) return@forEach
                weighted[normalized] = (weighted[normalized] ?: 0) + weight
            }
        }

        addTokens(title, 3)
        addTokens(content, 1)

        val ranked =
            weighted.entries
                .sortedWith(
                    compareByDescending<Map.Entry<String, Int>> { it.value }
                        .thenByDescending { it.key.length },
                ).map { it.key }

        return sanitizeTags(frontmatterTags + ranked + existing, maxTags)
    }

    private fun tokenize(source: String): List<String> {
        if (source.isBlank()) return emptyList()
        val normalized =
            source
                .replace(FENCED_CODE_REGEX, " ")
                .replace(MARKDOWN_IMAGE_REGEX, " ")
                .replace(MARKDOWN_LINK_REGEX, "$1")
                .replace(URL_REGEX, " ")
                .replace(PUNCTUATION_REGEX, " ")
                .replace(WHITESPACE_REGEX, " ")
                .trim()
        if (normalized.isBlank()) return emptyList()
        return TOKEN_REGEX.findAll(normalized).map { it.value }.toList()
    }

    private fun sanitizeTags(
        rawTags: List<String>,
        maxTags: Int,
    ): List<String> {
        val result = LinkedHashMap<String, String>()
        rawTags.forEach { raw ->
            val normalized = normalizeTag(raw)
            if (normalized.isEmpty()) return@forEach
            if (result.size >= maxTags) return@forEach
            val dedupeKey = normalized.lowercase()
            if (!result.containsKey(dedupeKey)) {
                result[dedupeKey] = normalized
            }
        }
        return result.values.toList()
    }

    private fun normalizeTag(raw: String): String {
        val cleaned =
            raw
                .replace("\r", " ")
                .replace("\n", " ")
                .replace("#", "")
                .replace("\"", " ")
                .replace("'", " ")
                .replace(WHITESPACE_REGEX, " ")
                .trim()
        if (cleaned.isBlank()) return ""
        if (cleaned.length < 2) return ""
        if (cleaned.length > normalizedMaxTagLength) return ""
        if (cleaned.contains("http://", true) || cleaned.contains("https://", true)) return ""
        return cleaned
    }

    private fun sanitizePromptContent(content: String): String {
        if (content.length <= MAX_PROMPT_CONTENT_LENGTH) return content
        val front = content.take(MAX_PROMPT_CONTENT_LENGTH / 2)
        val back = content.takeLast(MAX_PROMPT_CONTENT_LENGTH / 2)
        return buildString {
            append(front)
            append("\n...\n")
            append(back)
        }
    }

    private fun stripCodeFence(raw: String): String {
        val trimmed = raw.trim()
        if (!trimmed.startsWith("```")) return trimmed
        val withoutStart = trimmed.removePrefix("```json").removePrefix("```")
        return withoutStart.removeSuffix("```").trim()
    }

    private fun recommendationCacheKey(
        title: String,
        content: String,
        existingTags: List<String>,
        maxTags: Int,
    ): String {
        val normalizedTags = existingTags.map { it.lowercase() }.sorted().joinToString(",")
        val signature = "$title\n$content\n$normalizedTags\n$maxTags\n${sanitizeModel(geminiModel)}"
        return "post:tag-recommend:${signature.hashCode()}:${signature.length}"
    }

    private fun readCache(
        cacheKey: String,
        nowMillis: Long,
    ): PostTagRecommendationResult? {
        if (redisKeyValuePort.isAvailable()) {
            redisKeyValuePort
                .get(cacheKey)
                ?.let { payload ->
                    runCatching { objectMapper.readValue(payload, PostTagRecommendationResult::class.java) }.getOrNull()
                }?.let { return it }
        }

        synchronized(cacheLock) {
            val entry = recommendationCache[cacheKey] ?: return null
            if (entry.expiresAtMillis <= nowMillis) {
                recommendationCache.remove(cacheKey)
                return null
            }
            return entry.result
        }
    }

    private fun writeCache(
        cacheKey: String,
        result: PostTagRecommendationResult,
        ttlSeconds: Long,
        nowMillis: Long,
    ) {
        val clampedTtlSeconds = ttlSeconds.coerceIn(5, 3_600)
        if (redisKeyValuePort.isAvailable()) {
            runCatching {
                val serialized = objectMapper.writeValueAsString(result)
                redisKeyValuePort.set(cacheKey, serialized, Duration.ofSeconds(clampedTtlSeconds))
            }
        }

        synchronized(cacheLock) {
            recommendationCache[cacheKey] =
                CacheEntry(
                    result = result,
                    expiresAtMillis = nowMillis + clampedTtlSeconds * 1_000,
                )
        }
    }

    private fun fallbackAndCache(
        cacheKey: String,
        tags: List<String>,
        reason: String,
        nowMillis: Long,
    ): PostTagRecommendationResult {
        val fallbackResult =
            PostTagRecommendationResult(
                tags = tags,
                provider = "rule",
                model = null,
                reason = reason,
            )
        writeCache(cacheKey, fallbackResult, normalizedFallbackCacheTtlSeconds, nowMillis)
        return fallbackResult
    }

    private fun allowRequest(nowMillis: Long): Boolean {
        if (redisKeyValuePort.isAvailable()) {
            val allowedByRedis = allowRequestByRedis(nowMillis)
            if (allowedByRedis != null) return allowedByRedis
        }
        return allowRequestByInMemory(nowMillis)
    }

    private fun allowRequestByRedis(nowMillis: Long): Boolean? {
        val dateKey = DateTimeFormatter.BASIC_ISO_DATE.format(Instant.ofEpochMilli(nowMillis).atZone(zoneId).toLocalDate())
        val minuteBucket = nowMillis / 60_000
        val minuteKey = "post:tag-recommend:rate:minute:$minuteBucket"
        val dayKey = "post:tag-recommend:rate:day:$dateKey"
        return try {
            val minuteCount = redisKeyValuePort.increment(minuteKey) ?: return null
            if (minuteCount == 1L) {
                redisKeyValuePort.expire(minuteKey, Duration.ofMinutes(1))
            }
            if (minuteCount > normalizedMinuteLimit) return false

            val dayCount = redisKeyValuePort.increment(dayKey) ?: return null
            if (dayCount == 1L) {
                redisKeyValuePort.expire(dayKey, Duration.ofDays(1))
            }
            dayCount <= normalizedDayLimit
        } catch (exception: Exception) {
            log.warn("tag_recommend redis rate-limit fallback: {}", exception.message)
            null
        }
    }

    private fun allowRequestByInMemory(nowMillis: Long): Boolean =
        synchronized(fallbackLimitLock) {
            val minuteWindowStart = nowMillis - 60_000
            while (recentRequestTimestamps.isNotEmpty() && recentRequestTimestamps.first() < minuteWindowStart) {
                recentRequestTimestamps.removeFirst()
            }
            if (recentRequestTimestamps.size >= normalizedMinuteLimit) return false

            val today = Instant.ofEpochMilli(nowMillis).atZone(zoneId).toLocalDate()
            if (today != usageDate) {
                usageDate = today
                usageCount = 0
            }
            if (usageCount >= normalizedDayLimit) return false

            recentRequestTimestamps.addLast(nowMillis)
            usageCount += 1
            true
        }

    private fun sanitizeGeminiBaseUrl(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.isBlank()) return DEFAULT_GEMINI_BASE_URL
        return trimmed.removeSuffix("/")
    }

    private fun sanitizeModel(raw: String): String {
        val trimmed = raw.trim()
        return if (trimmed.isBlank()) DEFAULT_GEMINI_MODEL else trimmed
    }

    private fun newTraceId(): String = "tag-${System.currentTimeMillis()}-${Random.nextInt(1000, 9999)}"

    private fun previewText(
        value: String?,
        maxLength: Int = 180,
    ): String {
        val normalized = value.orEmpty().replace(WHITESPACE_REGEX, " ").trim()
        if (normalized.length <= maxLength) return normalized
        return "${normalized.take(maxLength).trim()}..."
    }

    private fun recordMetrics(
        provider: String,
        reason: String?,
    ) {
        val registry = meterRegistry ?: return
        runCatching {
            registry
                .counter(
                    "post.tag.recommend.requests",
                    "provider",
                    provider,
                    "reason",
                    reason ?: "none",
                ).increment()
        }
    }

    companion object {
        private const val MAX_PROMPT_CONTENT_LENGTH = 9_000
        private const val MAX_TITLE_LENGTH = 300
        private const val CACHE_MAX_ENTRIES = 512
        private const val DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
        private const val DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
        private val TOKEN_REGEX = Regex("[\\p{IsHangul}\\p{L}\\p{N}_-]{2,24}")
        private val FENCED_CODE_REGEX = Regex("```[\\s\\S]*?```")
        private val MARKDOWN_IMAGE_REGEX = Regex("!\\[[^\\]]*\\]\\(([^)\\s]+)(?:\\s+\"[^\"]*\")?\\)")
        private val MARKDOWN_LINK_REGEX = Regex("\\[(.*?)\\]\\((.*?)\\)")
        private val URL_REGEX = Regex("https?://\\S+")
        private val PUNCTUATION_REGEX = Regex("[#>*_~`|=+^:;!?.,(){}\\[\\]/\\\\]")
        private val WHITESPACE_REGEX = Regex("\\s+")
        private val STOPWORDS =
            setOf(
                "the",
                "and",
                "for",
                "with",
                "this",
                "that",
                "from",
                "into",
                "about",
                "your",
                "are",
                "was",
                "were",
                "have",
                "has",
                "had",
                "then",
                "than",
                "where",
                "when",
                "which",
                "also",
                "just",
                "very",
                "blog",
                "post",
                "개발",
                "블로그",
                "정리",
                "기록",
                "문제",
                "해결",
                "테스트",
                "코드",
                "기능",
            )

        private val SHARED_HTTP_CLIENT: HttpClient =
            HttpClient
                .newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .build()
    }
}
