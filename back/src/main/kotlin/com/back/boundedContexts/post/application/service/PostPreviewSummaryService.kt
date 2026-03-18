package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.dto.PostPreviewExtractor
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Service
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.ArrayDeque
import java.util.LinkedHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlin.random.Random

/**
 * PostPreviewSummaryService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class PostPreviewSummaryService(
    @param:Value("\${custom.ai.summary.enabled:false}")
    private val aiSummaryEnabled: Boolean,
    @param:Value("\${custom.ai.summary.timeoutSeconds:7}")
    private val timeoutSeconds: Long,
    @param:Value("\${custom.ai.summary.maxRequestsPerMinute:20}")
    private val maxRequestsPerMinute: Int,
    @param:Value("\${custom.ai.summary.maxRequestsPerDay:500}")
    private val maxRequestsPerDay: Int,
    @param:Value("\${custom.ai.summary.cacheTtlSeconds:300}")
    private val cacheTtlSeconds: Long,
    @param:Value("\${custom.ai.summary.fallbackCacheTtlSeconds:45}")
    private val fallbackCacheTtlSeconds: Long,
    @param:Value("\${custom.ai.summary.retryMaxAttempts:2}")
    private val retryMaxAttempts: Int,
    @param:Value("\${custom.ai.summary.retryBaseDelayMs:350}")
    private val retryBaseDelayMs: Long,
    @param:Value("\${custom.ai.summary.retryMaxDelayMs:2500}")
    private val retryMaxDelayMs: Long,
    @param:Value("\${custom.ai.summary.circuitFailureThreshold:5}")
    private val circuitFailureThreshold: Int,
    @param:Value("\${custom.ai.summary.circuitOpenSeconds:90}")
    private val circuitOpenSeconds: Long,
    @param:Value("\${custom.ai.summary.gemini.apiKey:}")
    private val geminiApiKey: String,
    @param:Value("\${custom.ai.summary.gemini.model:gemini-2.5-flash}")
    private val geminiModel: String,
    private val redisTemplateProvider: ObjectProvider<StringRedisTemplate>,
    private val objectMapper: ObjectMapper,
) {
    data class SummaryResult(
        val summary: String,
        val provider: String,
        val model: String?,
        val reason: String? = null,
    )

    private data class CacheEntry(
        val result: SummaryResult,
        val expiresAtMillis: Long,
    )

    private val log = LoggerFactory.getLogger(javaClass)
    private val httpClient =
        HttpClient
            .newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build()
    private val zoneId: ZoneId = ZoneId.systemDefault()

    // 설계상 서킷 브레이커 상태는 프로세스 로컬로만 유지한다.
    private val stateLock = Any()
    private var consecutiveFailures: Int = 0
    private var circuitOpenedUntilMillis: Long = 0L

    // Redis가 불가할 때 사용할 메모리 기반 대체 제한기.
    private val rateLimitFallbackLock = Any()
    private val recentRequestTimestamps = ArrayDeque<Long>()
    private var usageDate: LocalDate = LocalDate.now(zoneId)
    private var usageCount: Int = 0

    private val normalizedMaxRequestsPerMinute = maxRequestsPerMinute.coerceIn(1, 500)
    private val normalizedMaxRequestsPerDay = maxRequestsPerDay.coerceIn(10, 200_000)
    private val normalizedCacheTtlSeconds = cacheTtlSeconds.coerceIn(5, 3_600)
    private val normalizedFallbackCacheTtlSeconds = fallbackCacheTtlSeconds.coerceIn(5, 600)
    private val normalizedRetryMaxAttempts = retryMaxAttempts.coerceIn(0, 5)
    private val normalizedRetryBaseDelayMs = retryBaseDelayMs.coerceIn(50, 5_000)
    private val normalizedRetryMaxDelayMs = retryMaxDelayMs.coerceIn(normalizedRetryBaseDelayMs, 30_000)
    private val normalizedCircuitFailureThreshold = circuitFailureThreshold.coerceIn(1, 20)
    private val normalizedCircuitOpenMillis = circuitOpenSeconds.coerceIn(5, 600) * 1_000
    private val normalizedCacheMaxEntries = DEFAULT_CACHE_MAX_ENTRIES

    // Redis가 불가할 때 사용할 메모리 기반 대체 캐시.
    private val cacheLock = Any()
    private val summaryCache =
        object : LinkedHashMap<String, CacheEntry>(normalizedCacheMaxEntries, 0.75f, true) {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, CacheEntry>): Boolean = size > normalizedCacheMaxEntries
        }

    // Redis 대체 경로 경고 로그 스로틀링.
    private val lastRedisWarnEpochSeconds = AtomicLong(0)
    private val suppressedRedisFallbackWarnCount = AtomicLong(0)

    /**
     * 생성 로직을 실행하고 실패 시 대체 경로를 적용합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    fun generate(
        title: String,
        content: String,
        maxLength: Int,
    ): SummaryResult {
        val normalizedMaxLength = maxLength.coerceIn(80, 220)
        val cacheKey = summaryCacheKey(title, content, normalizedMaxLength)
        val now = System.currentTimeMillis()
        readCache(cacheKey, now)?.let { return it }

        val fallback = fallbackSummary(content, normalizedMaxLength)
        val normalizedTitle = title.trim()
        val titleLength = normalizedTitle.length
        val contentLength = content.length

        if (!aiSummaryEnabled) {
            return fallbackAndCache(
                cacheKey = cacheKey,
                summary = fallback,
                reason = "ai-disabled",
                ttlSeconds = normalizedFallbackCacheTtlSeconds,
                nowMillis = now,
                titleLength = titleLength,
                contentLength = contentLength,
            )
        }

        val normalizedApiKey = geminiApiKey.trim()
        if (normalizedApiKey.isEmpty()) {
            return fallbackAndCache(
                cacheKey = cacheKey,
                summary = fallback,
                reason = "api-key-missing",
                ttlSeconds = normalizedFallbackCacheTtlSeconds,
                nowMillis = now,
                titleLength = titleLength,
                contentLength = contentLength,
            )
        }

        val normalizedModel = sanitizeModel(geminiModel)
        if (!acquireAiRequestSlot(now)) {
            return fallbackAndCache(
                cacheKey = cacheKey,
                summary = fallback,
                reason = "rate-limited-or-circuit-open",
                ttlSeconds = normalizedFallbackCacheTtlSeconds,
                nowMillis = now,
                titleLength = titleLength,
                contentLength = contentLength,
            )
        }

        val prompt =
            buildPrompt(
                title = normalizedTitle,
                content = content,
                maxLength = normalizedMaxLength,
            )

        val requestBody =
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
                        "maxOutputTokens" to 180,
                    ),
            )

        val responseBody = sendWithRetry(normalizedModel, normalizedApiKey, requestBody)

        if (responseBody == null) {
            markFailure("transport")
            return fallbackAndCache(
                cacheKey = cacheKey,
                summary = fallback,
                reason = "transport",
                ttlSeconds = normalizedFallbackCacheTtlSeconds,
                nowMillis = now,
                titleLength = titleLength,
                contentLength = contentLength,
            )
        }

        if (responseBody.statusCode() >= 400) {
            markFailure("status=${responseBody.statusCode()}")
            return fallbackAndCache(
                cacheKey = cacheKey,
                summary = fallback,
                reason = "status-${responseBody.statusCode()}",
                ttlSeconds = normalizedFallbackCacheTtlSeconds,
                nowMillis = now,
                titleLength = titleLength,
                contentLength = contentLength,
            )
        }

        val aiSummaryParseResult =
            runCatching {
                val root = objectMapper.readTree(responseBody.body())
                extractSummaryText(root)
            }.onFailure { exception ->
                log.warn("Gemini summary response parse failed", exception)
            }
        val aiSummary = aiSummaryParseResult.getOrNull()
        if (aiSummaryParseResult.isFailure) {
            markFailure("parse-error")
            return fallbackAndCache(
                cacheKey = cacheKey,
                summary = fallback,
                reason = "parse-error",
                ttlSeconds = normalizedFallbackCacheTtlSeconds,
                nowMillis = now,
                titleLength = titleLength,
                contentLength = contentLength,
            )
        }

        val normalizedAiSummary = normalizeSummary(aiSummary, normalizedMaxLength)
        if (normalizedAiSummary.isBlank() || isLowQualityAiSummary(normalizedAiSummary, fallback, normalizedMaxLength)) {
            val reason = if (normalizedAiSummary.isBlank()) "empty-summary" else "low-quality-summary"
            markFailure(reason)
            return fallbackAndCache(
                cacheKey = cacheKey,
                summary = fallback,
                reason = reason,
                ttlSeconds = normalizedFallbackCacheTtlSeconds,
                nowMillis = now,
                titleLength = titleLength,
                contentLength = contentLength,
            )
        }

        markSuccess()
        return cacheAndReturn(
            cacheKey = cacheKey,
            result = SummaryResult(summary = normalizedAiSummary, provider = "gemini", model = normalizedModel, reason = null),
            ttlSeconds = normalizedCacheTtlSeconds,
            nowMillis = now,
        )
    }

    private fun fallbackAndCache(
        cacheKey: String,
        summary: String,
        reason: String,
        ttlSeconds: Long,
        nowMillis: Long,
        titleLength: Int,
        contentLength: Int,
    ): SummaryResult {
        logFallback(reason = reason, titleLength = titleLength, contentLength = contentLength)
        return cacheAndReturn(
            cacheKey = cacheKey,
            result = SummaryResult(summary = summary, provider = "rule", model = null, reason = reason),
            ttlSeconds = ttlSeconds,
            nowMillis = nowMillis,
        )
    }

    private fun logFallback(
        reason: String,
        titleLength: Int,
        contentLength: Int,
    ) {
        val baseMessage =
            "Preview summary fallback -> rule (reason={}, titleLength={}, contentLength={})"
        when (reason) {
            "ai-disabled", "api-key-missing", "rate-limited-or-circuit-open" -> {
                log.info(baseMessage, reason, titleLength, contentLength)
            }
            else -> {
                log.warn(baseMessage, reason, titleLength, contentLength)
            }
        }
    }

    /**
     * fallbackSummary 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun fallbackSummary(
        content: String,
        maxLength: Int,
    ): String = truncateSummary(PostPreviewExtractor.makeSummary(content), maxLength)

    /**
     * buildPrompt 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun buildPrompt(
        title: String,
        content: String,
        maxLength: Int,
    ): String {
        val normalizedTitle = title.ifBlank { "(제목 없음)" }
        val normalizedContent =
            content
                .trim()
                .take(MAX_PROMPT_CONTENT_LENGTH)

        return listOf(
            "아래 기술 블로그 글을 한국어로 요약하세요.",
            "출력 규칙:",
            "- 결과는 정확히 한 문단",
            "- 최대 ${maxLength}자",
            "- 핵심 문제/원인/해결/결과를 우선",
            "- 군더더기 인사말, 자기언급, 불필요한 수식어 금지",
            "- 마크다운, 번호 목록, 따옴표, \"요약:\" 접두사 금지",
            "",
            "제목:",
            normalizedTitle,
            "",
            "본문:",
            normalizedContent,
        ).joinToString("\n")
    }

    private fun buildGeminiUri(
        model: String,
        apiKey: String,
    ): URI {
        val encodedApiKey = URLEncoder.encode(apiKey, StandardCharsets.UTF_8)
        return URI.create("https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$encodedApiKey")
    }

    /**
     * sanitizeModel 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun sanitizeModel(raw: String): String {
        val normalized = raw.trim()
        return if (normalized.matches(Regex("[a-zA-Z0-9._-]+"))) {
            normalized
        } else {
            "gemini-2.5-flash"
        }
    }

    /**
     * 원본 입력에서 필요한 값을 안전하게 추출합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    @Suppress("DEPRECATION")
    private fun extractSummaryText(root: JsonNode): String {
        val candidates = root.path("candidates")
        if (!candidates.isArray || candidates.isEmpty) return ""

        for (candidate in candidates) {
            val parts = candidate.path("content").path("parts")
            if (!parts.isArray || parts.isEmpty) continue

            for (part in parts) {
                val text =
                    part
                        .path("text")
                        .textValue()
                        ?.trim()
                        .orEmpty()
                if (text.isNotBlank()) return text
            }
        }

        return ""
    }

    private fun normalizeSummary(
        raw: String?,
        maxLength: Int,
    ): String {
        val cleaned =
            raw
                .orEmpty()
                .replace(Regex("^[\"'“”‘’\\s]*요약\\s*[:：-]\\s*"), "")
                .replace(Regex("[\\r\\n]+"), " ")
                .replace(Regex("\\s+"), " ")
                .trim()

        return truncateSummary(cleaned, maxLength)
    }

    private fun isLowQualityAiSummary(
        aiSummary: String,
        fallbackSummary: String,
        maxLength: Int,
    ): Boolean {
        val normalizedAi = aiSummary.trim()
        val normalizedFallback = fallbackSummary.trim()
        if (normalizedAi.isBlank()) return true
        if (normalizedFallback.isBlank()) return false

        val minExpectedLength =
            (maxLength * AI_MIN_LENGTH_RATIO)
                .toInt()
                .coerceAtLeast(AI_MIN_ABSOLUTE_LENGTH)
        val isTooShortAgainstFallback =
            normalizedAi.length < minExpectedLength &&
                normalizedFallback.length >= FALLBACK_MIN_LENGTH_FOR_OVERRIDE &&
                normalizedFallback.length >= normalizedAi.length + FALLBACK_LENGTH_GAP_THRESHOLD
        if (isTooShortAgainstFallback) return true

        val hasQuotedFragmentPattern =
            normalizedAi.length <= AI_QUOTED_FRAGMENT_MAX_LENGTH &&
                (normalizedAi.contains('"') || normalizedAi.contains('“') || normalizedAi.contains('”'))
        return hasQuotedFragmentPattern && normalizedFallback.length >= FALLBACK_MIN_LENGTH_FOR_OVERRIDE
    }

    /**
     * truncateSummary 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun truncateSummary(
        value: String,
        maxLength: Int,
    ): String {
        if (value.length <= maxLength) return value
        return "${value.take(maxLength).trim()}..."
    }

    private fun summaryCacheKey(
        title: String,
        content: String,
        maxLength: Int,
    ): String = "$maxLength:${hashString(title.trim())}:${hashString(content.trim())}"

    private fun hashString(value: String): String {
        var hash = 2166136261u
        value.forEach { char ->
            hash = (hash xor char.code.toUInt()) * 16777619u
        }
        return hash.toString(36)
    }

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun readCache(
        cacheKey: String,
        nowMillis: Long,
    ): SummaryResult? {
        readCacheInRedis(cacheKey)?.let { return it }
        return readCacheInMemory(cacheKey, nowMillis)
    }

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun readCacheInRedis(cacheKey: String): SummaryResult? {
        val redisTemplate = redisTemplateProvider.getIfAvailable() ?: return null
        val key = redisCacheKey(cacheKey)
        val payload =
            runCatching { redisTemplate.opsForValue().get(key) }
                .onFailure { exception -> warnRedisFallback("cache-read", exception) }
                .getOrNull()
                ?: return null

        val parsed =
            runCatching { objectMapper.readValue(payload, SummaryResult::class.java) }
                .onFailure { exception ->
                    warnRedisFallback("cache-parse", exception)
                }.getOrNull()
                ?: return null

        return parsed
    }

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun readCacheInMemory(
        cacheKey: String,
        nowMillis: Long,
    ): SummaryResult? =
        synchronized(cacheLock) {
            val entry = summaryCache[cacheKey] ?: return null
            if (entry.expiresAtMillis <= nowMillis) {
                summaryCache.remove(cacheKey)
                return null
            }
            entry.result
        }

    private fun cacheAndReturn(
        cacheKey: String,
        result: SummaryResult,
        ttlSeconds: Long,
        nowMillis: Long,
    ): SummaryResult {
        writeCacheInRedis(cacheKey, result, ttlSeconds)
        writeCacheInMemory(cacheKey, result, ttlSeconds, nowMillis)
        return result
    }

    /**
     * 생성 요청을 처리하고 멱등성·후속 동기화 절차를 함께 수행합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun writeCacheInRedis(
        cacheKey: String,
        result: SummaryResult,
        ttlSeconds: Long,
    ) {
        val redisTemplate = redisTemplateProvider.getIfAvailable() ?: return
        val key = redisCacheKey(cacheKey)

        runCatching {
            val payload = objectMapper.writeValueAsString(result)
            redisTemplate.opsForValue().set(key, payload, Duration.ofSeconds(ttlSeconds.coerceAtLeast(1)))
        }.onFailure { exception ->
            warnRedisFallback("cache-write", exception)
        }
    }

    private fun writeCacheInMemory(
        cacheKey: String,
        result: SummaryResult,
        ttlSeconds: Long,
        nowMillis: Long,
    ) {
        synchronized(cacheLock) {
            summaryCache[cacheKey] =
                CacheEntry(
                    result = result,
                    expiresAtMillis = nowMillis + ttlSeconds.coerceAtLeast(1) * 1000,
                )
        }
    }

    /**
     * 동시성 제어를 위한 슬롯 획득을 시도합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun acquireAiRequestSlot(nowMillis: Long): Boolean {
        synchronized(stateLock) {
            if (nowMillis < circuitOpenedUntilMillis) return false
        }

        val redisTemplate = redisTemplateProvider.getIfAvailable()
        if (redisTemplate != null) {
            val redisResult = acquireAiRequestSlotInRedis(redisTemplate, nowMillis)
            if (redisResult != null) return redisResult
        }

        return acquireAiRequestSlotInMemory(nowMillis)
    }

    /**
     * 동시성 제어를 위한 슬롯 획득을 시도합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun acquireAiRequestSlotInRedis(
        redisTemplate: StringRedisTemplate,
        nowMillis: Long,
    ): Boolean? {
        val ops = redisTemplate.opsForValue()
        val day = InstantEpoch.toLocalDate(nowMillis, zoneId)
        val dayKey = "$REDIS_RATE_LIMIT_DAY_KEY_PREFIX${day.format(DateTimeFormatter.BASIC_ISO_DATE)}"
        val minuteBucket = nowMillis / MINUTE_WINDOW_MILLIS
        val minuteKey = "$REDIS_RATE_LIMIT_MINUTE_KEY_PREFIX$minuteBucket"

        return runCatching {
            val dayCount =
                ops.increment(dayKey)
                    ?: throw IllegalStateException("Redis INCR returned null for key=$dayKey")
            if (dayCount == 1L) {
                redisTemplate.expire(dayKey, dayLimitKeyTtl(nowMillis))
            }
            if (dayCount > normalizedMaxRequestsPerDay) {
                return@runCatching false
            }

            val minuteCount =
                ops.increment(minuteKey)
                    ?: throw IllegalStateException("Redis INCR returned null for key=$minuteKey")
            if (minuteCount == 1L) {
                redisTemplate.expire(minuteKey, Duration.ofSeconds(MINUTE_WINDOW_KEY_TTL_SECONDS))
            }
            minuteCount <= normalizedMaxRequestsPerMinute
        }.onFailure { exception ->
            warnRedisFallback("rate-limit", exception)
        }.getOrNull()
    }

    private fun acquireAiRequestSlotInMemory(nowMillis: Long): Boolean =
        synchronized(rateLimitFallbackLock) {
            rollUsageWindowIfNeeded(nowMillis)
            if (usageCount >= normalizedMaxRequestsPerDay) return false

            val threshold = nowMillis - MINUTE_WINDOW_MILLIS
            while (recentRequestTimestamps.isNotEmpty() && recentRequestTimestamps.first() <= threshold) {
                recentRequestTimestamps.removeFirst()
            }
            if (recentRequestTimestamps.size >= normalizedMaxRequestsPerMinute) return false

            usageCount += 1
            recentRequestTimestamps.addLast(nowMillis)
            true
        }

    private fun rollUsageWindowIfNeeded(nowMillis: Long) {
        val today = InstantEpoch.toLocalDate(nowMillis, zoneId)
        if (today != usageDate) {
            usageDate = today
            usageCount = 0
            recentRequestTimestamps.clear()
        }
    }

    private fun dayLimitKeyTtl(nowMillis: Long): Duration {
        val now = Instant.ofEpochMilli(nowMillis).atZone(zoneId)
        val nextRotation =
            now
                .toLocalDate()
                .plusDays(1)
                .atStartOfDay(zoneId)
                .plusHours(1)
        val ttlSeconds = Duration.between(now, nextRotation).seconds.coerceAtLeast(60)
        return Duration.ofSeconds(ttlSeconds)
    }

    /**
     * markFailure 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun markFailure(reason: String) {
        synchronized(stateLock) {
            consecutiveFailures += 1
            if (consecutiveFailures >= normalizedCircuitFailureThreshold) {
                circuitOpenedUntilMillis = System.currentTimeMillis() + normalizedCircuitOpenMillis
                consecutiveFailures = 0
                log.warn("Gemini summary circuit opened for {}ms ({})", normalizedCircuitOpenMillis, reason)
                return
            }
            log.warn("Gemini summary failure ({}) count={}", reason, consecutiveFailures)
        }
    }

    private fun markSuccess() {
        synchronized(stateLock) {
            consecutiveFailures = 0
            circuitOpenedUntilMillis = 0L
        }
    }

    /**
     * 이벤트/메시지를 전파하고 실패를 안전하게 처리합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun sendWithRetry(
        model: String,
        apiKey: String,
        requestBody: Map<String, Any>,
    ): HttpResponse<String>? {
        var attempt = 0
        while (true) {
            val response =
                runCatching {
                    val request =
                        HttpRequest
                            .newBuilder()
                            .uri(buildGeminiUri(model, apiKey))
                            .timeout(Duration.ofSeconds(timeoutSeconds.coerceIn(3, 20)))
                            .header("Content-Type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody)))
                            .build()

                    httpClient.send(request, HttpResponse.BodyHandlers.ofString())
                }.onFailure { exception ->
                    if (attempt >= normalizedRetryMaxAttempts) {
                        log.warn("Gemini summary request failed after retries", exception)
                    }
                }.getOrNull()

            if (response == null) {
                if (attempt >= normalizedRetryMaxAttempts) return null
                if (!sleepBeforeRetry(resolveRetryDelayMs(null, attempt))) return null
                attempt += 1
                continue
            }

            if (response.statusCode() in 200..299) return response

            if (shouldRetry(response.statusCode()) && attempt < normalizedRetryMaxAttempts) {
                if (!sleepBeforeRetry(resolveRetryDelayMs(response, attempt))) return response
                attempt += 1
                continue
            }

            return response
        }
    }

    private fun shouldRetry(statusCode: Int): Boolean = statusCode in RETRYABLE_STATUSES

    /**
     * 실행 시점에 필요한 의존성/값을 결정합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun resolveRetryDelayMs(
        response: HttpResponse<String>?,
        attempt: Int,
    ): Long {
        val retryAfterMs = response?.let { parseRetryAfterMs(it) }
        if (retryAfterMs != null) {
            return retryAfterMs.coerceIn(200L, normalizedRetryMaxDelayMs)
        }

        val exponential =
            (normalizedRetryBaseDelayMs * (1L shl attempt.coerceIn(0, 10)))
                .coerceAtMost(normalizedRetryMaxDelayMs)
        val jitter = Random.nextLong(0L, normalizedRetryBaseDelayMs.coerceAtLeast(2))
        return (exponential + jitter).coerceAtMost(normalizedRetryMaxDelayMs)
    }

    /**
     * 원본 입력에서 필요한 값을 안전하게 추출합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
    private fun parseRetryAfterMs(response: HttpResponse<String>): Long? {
        val retryAfter =
            response
                .headers()
                .firstValue("Retry-After")
                .orElse("")
                .trim()
        if (retryAfter.isEmpty()) return null

        retryAfter.toLongOrNull()?.let { seconds ->
            return seconds.coerceAtLeast(0L) * 1000
        }

        return runCatching {
            val retryAt = ZonedDateTime.parse(retryAfter, DateTimeFormatter.RFC_1123_DATE_TIME)
            val diffMs = Duration.between(ZonedDateTime.now(retryAt.zone), retryAt).toMillis()
            diffMs.coerceAtLeast(0L)
        }.getOrNull()
    }

    private fun sleepBeforeRetry(delayMs: Long): Boolean =
        runCatching {
            Thread.sleep(delayMs.coerceAtLeast(0L))
            true
        }.onFailure { exception ->
            Thread.currentThread().interrupt()
            log.warn("Gemini summary retry sleep interrupted", exception)
        }.getOrDefault(false)

    private fun redisCacheKey(cacheKey: String): String = "$REDIS_CACHE_KEY_PREFIX$cacheKey"

    /**
     * warnRedisFallback 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    private fun warnRedisFallback(
        scope: String,
        exception: Throwable,
    ) {
        val nowEpochSeconds = Instant.now().epochSecond
        val previousWarnAt = lastRedisWarnEpochSeconds.get()
        if (nowEpochSeconds - previousWarnAt < REDIS_WARN_INTERVAL_SECONDS ||
            !lastRedisWarnEpochSeconds.compareAndSet(previousWarnAt, nowEpochSeconds)
        ) {
            suppressedRedisFallbackWarnCount.incrementAndGet()
            return
        }

        val suppressedCount = suppressedRedisFallbackWarnCount.getAndSet(0)
        log.warn(
            "Falling back to in-memory ai-summary {} because Redis access failed. suppressed={} cause={}",
            scope,
            suppressedCount,
            exception.message,
        )
        log.debug("Redis fallback stacktrace", exception)
    }

    companion object {
        private const val MINUTE_WINDOW_MILLIS = 60_000L
        private const val MINUTE_WINDOW_KEY_TTL_SECONDS = 180L
        private const val DEFAULT_CACHE_MAX_ENTRIES = 2048
        private const val MAX_PROMPT_CONTENT_LENGTH = 8_000
        private const val REDIS_WARN_INTERVAL_SECONDS = 300L
        private const val REDIS_CACHE_KEY_PREFIX = "post:preview:summary:cache:"
        private const val REDIS_RATE_LIMIT_DAY_KEY_PREFIX = "post:preview:summary:limit:day:"
        private const val REDIS_RATE_LIMIT_MINUTE_KEY_PREFIX = "post:preview:summary:limit:minute:"
        private const val AI_MIN_LENGTH_RATIO = 0.22
        private const val AI_MIN_ABSOLUTE_LENGTH = 22
        private const val AI_QUOTED_FRAGMENT_MAX_LENGTH = 30
        private const val FALLBACK_MIN_LENGTH_FOR_OVERRIDE = 36
        private const val FALLBACK_LENGTH_GAP_THRESHOLD = 16
        private val RETRYABLE_STATUSES = setOf(429, 500, 502, 503, 504)
    }

    private object InstantEpoch {
        fun toLocalDate(
            epochMillis: Long,
            zoneId: ZoneId,
        ): LocalDate =
            Instant
                .ofEpochMilli(epochMillis)
                .atZone(zoneId)
                .toLocalDate()
    }
}
