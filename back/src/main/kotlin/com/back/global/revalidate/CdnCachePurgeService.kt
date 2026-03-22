package com.back.global.revalidate

import com.back.boundedContexts.post.application.support.PostCacheTags
import io.micrometer.core.instrument.MeterRegistry
import jakarta.annotation.PreDestroy
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
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * CdnCachePurgeService는 CDN cache-tag 기반 purge를 수행하는 서비스입니다.
 * 쓰기 이벤트(발행/수정/삭제) 이후 태그 무효화를 비동기로 수행해 TTL 의존도를 낮춥니다.
 */
@Service
class CdnCachePurgeService(
    @Value("\${custom.cdn.purge.enabled:false}")
    private val purgeEnabled: Boolean,
    @Value("\${custom.cdn.purge.url:}")
    private val purgeUrl: String,
    @Value("\${custom.cdn.purge.token:}")
    private val purgeToken: String,
    @Value("\${custom.cdn.purge.connectTimeoutMs:1200}")
    connectTimeoutMs: Long,
    @Value("\${custom.cdn.purge.requestTimeoutMs:2500}")
    private val requestTimeoutMs: Long,
    @Value("\${custom.cdn.purge.coalesceWindowMs:1200}")
    private val coalesceWindowMs: Long,
    @Value("\${custom.cdn.purge.coalesceMaxTags:2048}")
    private val coalesceMaxTags: Int,
    private val objectMapper: ObjectMapper,
    private val meterRegistry: MeterRegistry? = null,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val normalizedConnectTimeoutMs = connectTimeoutMs.coerceIn(100, 10_000)
    private val httpClient = sharedHttpClient(normalizedConnectTimeoutMs)
    private val coalesceExecutor =
        Executors.newSingleThreadScheduledExecutor { runnable ->
            Thread(runnable, "cdn-cache-purge-coalescer").apply { isDaemon = true }
        }
    private val coalesceLock = Any()
    private val pendingTags = linkedSetOf<String>()
    private val pendingReasons = linkedSetOf<String>()
    private var isFlushScheduled = false

    fun isEnabled(): Boolean = purgeEnabled && purgeUrl.isNotBlank() && purgeToken.isNotBlank()

    fun purgePostReadCaches(
        postId: Long,
        beforeTags: Collection<String> = emptyList(),
        afterTags: Collection<String> = emptyList(),
    ) {
        purgeByTags(
            tags = PostCacheTags.writeInvalidationTags(postId, beforeTags, afterTags),
            reason = "post-write:$postId",
        )
    }

    /**
     * purgeByTags 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 네트워크 오류가 발생해도 본 요청 흐름은 차단하지 않습니다.
     */
    fun purgeByTags(
        tags: Collection<String>,
        reason: String,
    ) {
        if (!isEnabled()) return

        val normalizedTags = normalizeTags(tags)
        if (normalizedTags.isEmpty()) return

        enqueueCoalesced(normalizedTags, reason)
    }

    private fun enqueueCoalesced(
        normalizedTags: List<String>,
        reason: String,
    ) {
        var shouldScheduleFlush = false
        var flushNow: Pair<List<String>, String>? = null

        synchronized(coalesceLock) {
            pendingTags.addAll(normalizedTags)
            if (reason.isNotBlank()) {
                pendingReasons.add(reason.take(MAX_REASON_LENGTH))
            }

            if (pendingTags.size >= coalesceMaxTags.coerceAtLeast(64)) {
                flushNow = snapshotAndClearPendingLocked()
            } else if (!isFlushScheduled) {
                isFlushScheduled = true
                shouldScheduleFlush = true
            }
        }

        flushNow?.let { (tags, reasonSnapshot) ->
            purgeByTagsNow(tags, reasonSnapshot)
        }

        if (shouldScheduleFlush) {
            scheduleCoalescedFlush()
        }
    }

    private fun scheduleCoalescedFlush() {
        val delayMs = coalesceWindowMs.coerceIn(200, 10_000)
        coalesceExecutor.schedule(
            {
                val pending =
                    synchronized(coalesceLock) {
                        snapshotAndClearPendingLocked()
                    }
                if (pending.first.isNotEmpty()) {
                    purgeByTagsNow(pending.first, pending.second)
                }
            },
            delayMs,
            TimeUnit.MILLISECONDS,
        )
    }

    private fun snapshotAndClearPendingLocked(): Pair<List<String>, String> {
        val tagsSnapshot = pendingTags.toList()
        val reasonSnapshot = buildCoalescedReasonLocked()
        pendingTags.clear()
        pendingReasons.clear()
        isFlushScheduled = false
        return tagsSnapshot to reasonSnapshot
    }

    private fun buildCoalescedReasonLocked(): String {
        if (pendingReasons.isEmpty()) return "coalesced:unspecified"
        val samples = pendingReasons.take(MAX_REASON_SAMPLES)
        val extraCount = (pendingReasons.size - samples.size).coerceAtLeast(0)
        val prefix = samples.joinToString("|")
        if (extraCount == 0) return "coalesced:$prefix"
        return "coalesced:$prefix+$extraCount"
    }

    private fun purgeByTagsNow(
        normalizedTags: List<String>,
        reason: String,
    ) {
        val startedAtNanos = System.nanoTime()
        val reasonBucket = reason.substringBefore(':').take(24).ifBlank { "unknown" }
        val reqBody = objectMapper.writeValueAsString(mapOf("tags" to normalizedTags))
        val request =
            HttpRequest
                .newBuilder()
                .uri(URI.create(purgeUrl))
                .timeout(Duration.ofMillis(requestTimeoutMs.coerceIn(200, 15_000)))
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .header("Authorization", "Bearer $purgeToken")
                .POST(HttpRequest.BodyPublishers.ofString(reqBody))
                .build()

        runCatching {
            httpClient.send(request, HttpResponse.BodyHandlers.discarding())
        }.onSuccess { response ->
            val elapsedMs = (System.nanoTime() - startedAtNanos).coerceAtLeast(0L) / 1_000_000
            if (response.statusCode() >= 400) {
                meterRegistry
                    ?.timer("cdn.purge.duration", "status", "non_success", "reason", reasonBucket)
                    ?.record(elapsedMs, TimeUnit.MILLISECONDS)
                meterRegistry?.counter("cdn.purge.result", "status", "non_success", "reason", reasonBucket)?.increment()
                log.warn(
                    "cdn_cache_purge_non_success reason={} status={} tags={}",
                    reason,
                    response.statusCode(),
                    normalizedTags.joinToString(","),
                )
            } else {
                meterRegistry
                    ?.timer("cdn.purge.duration", "status", "success", "reason", reasonBucket)
                    ?.record(elapsedMs, TimeUnit.MILLISECONDS)
                meterRegistry?.counter("cdn.purge.result", "status", "success", "reason", reasonBucket)?.increment()
                log.info(
                    "cdn_cache_purge_ok reason={} status={} tags={}",
                    reason,
                    response.statusCode(),
                    normalizedTags.joinToString(","),
                )
            }
        }.onFailure { exception ->
            val elapsedMs = (System.nanoTime() - startedAtNanos).coerceAtLeast(0L) / 1_000_000
            meterRegistry
                ?.timer("cdn.purge.duration", "status", "failed", "reason", reasonBucket)
                ?.record(elapsedMs, TimeUnit.MILLISECONDS)
            meterRegistry?.counter("cdn.purge.result", "status", "failed", "reason", reasonBucket)?.increment()
            log.warn(
                "cdn_cache_purge_failed reason={} tags={}",
                reason,
                normalizedTags.joinToString(","),
                exception,
            )
        }
    }

    private fun normalizeTags(tags: Collection<String>): List<String> =
        tags
            .asSequence()
            .map(::normalizeCacheTagToken)
            .filter { it.isNotBlank() }
            .distinct()
            .toList()

    private fun normalizeCacheTagToken(raw: String): String =
        raw
            .trim()
            .lowercase()
            .replace(Regex("[^a-z0-9:_-]"), "-")
            .replace(Regex("-+"), "-")
            .trim('-')
            .take(MAX_TAG_LENGTH)

    @PreDestroy
    fun shutdownExecutor() {
        coalesceExecutor.shutdownNow()
    }

    companion object {
        private val SHARED_HTTP_CLIENTS = ConcurrentHashMap<Long, HttpClient>()
        private const val MAX_TAG_LENGTH = 64
        private const val MAX_REASON_LENGTH = 48
        private const val MAX_REASON_SAMPLES = 3

        private fun sharedHttpClient(connectTimeoutMs: Long): HttpClient =
            SHARED_HTTP_CLIENTS.computeIfAbsent(connectTimeoutMs) { timeoutMs ->
                HttpClient
                    .newBuilder()
                    .connectTimeout(Duration.ofMillis(timeoutMs))
                    .build()
            }
    }
}
