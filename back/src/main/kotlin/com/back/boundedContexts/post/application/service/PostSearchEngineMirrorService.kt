package com.back.boundedContexts.post.application.service

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
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

/**
 * PostSearchEngineMirrorService는 게시글 태그 인덱스를 외부 검색엔진(OpenSearch/ES)에 미러링한다.
 * 기본값은 disabled이며, endpoint/key를 채운 경우에만 dual-write를 수행한다.
 */
@Service
class PostSearchEngineMirrorService(
    @param:Value("\${custom.post.search-engine.mirror.enabled:false}")
    private val enabled: Boolean,
    @param:Value("\${custom.post.search-engine.mirror.endpoint:}")
    private val endpoint: String,
    @param:Value("\${custom.post.search-engine.mirror.apiKey:}")
    private val apiKey: String,
    @param:Value("\${custom.post.search-engine.mirror.connectTimeoutMs:1200}")
    connectTimeoutMs: Long,
    @param:Value("\${custom.post.search-engine.mirror.requestTimeoutMs:2500}")
    private val requestTimeoutMs: Long,
    @param:Value("\${custom.post.search-engine.mirror.maxTags:32}")
    maxTags: Int,
    @param:Value("\${custom.post.search-engine.mirror.circuit.failureThreshold:5}")
    failureThreshold: Int,
    @param:Value("\${custom.post.search-engine.mirror.circuit.openSeconds:60}")
    circuitOpenSeconds: Long,
    private val objectMapper: ObjectMapper,
    private val meterRegistry: MeterRegistry? = null,
) {
    data class MirrorCircuitStatus(
        val open: Boolean,
        val openUntilEpochMs: Long,
        val remainingSeconds: Long,
        val consecutiveFailures: Int,
        val failureThreshold: Int,
    )

    private val logger = LoggerFactory.getLogger(PostSearchEngineMirrorService::class.java)
    private val safeMaxTags = maxTags.coerceIn(1, 128)
    private val normalizedConnectTimeoutMs = connectTimeoutMs.coerceIn(100, 10_000)
    private val safeFailureThreshold = failureThreshold.coerceIn(1, 100)
    private val safeCircuitOpenMillis = circuitOpenSeconds.coerceIn(1, 3_600) * 1_000
    private val httpClient = sharedHttpClient(normalizedConnectTimeoutMs)
    private val consecutiveFailureCount = AtomicInteger(0)
    private val circuitOpenUntilEpochMs = AtomicLong(0L)
    private val runtimeForceDisabled = AtomicBoolean(false)

    fun setRuntimeForceDisabled(forceDisabled: Boolean) {
        runtimeForceDisabled.set(forceDisabled)
    }

    fun isRuntimeForceDisabled(): Boolean = runtimeForceDisabled.get()

    fun getCircuitStatus(): MirrorCircuitStatus {
        val now = System.currentTimeMillis()
        val openUntil = circuitOpenUntilEpochMs.get()
        val remainingMillis = (openUntil - now).coerceAtLeast(0L)
        val remainingSeconds = if (remainingMillis == 0L) 0L else ((remainingMillis - 1L) / 1_000L) + 1L
        return MirrorCircuitStatus(
            open = openUntil > now,
            openUntilEpochMs = openUntil,
            remainingSeconds = remainingSeconds,
            consecutiveFailures = consecutiveFailureCount.get(),
            failureThreshold = safeFailureThreshold,
        )
    }

    fun mirror(
        postId: Long,
        tags: Collection<String>,
        deleted: Boolean,
    ) {
        if (!enabled) return
        if (endpoint.isBlank()) return
        if (isRuntimeForceDisabled()) {
            meterRegistry?.counter("post.search_engine.mirror.result", "status", "skipped_force_disabled")?.increment()
            return
        }
        if (isCircuitOpen()) {
            meterRegistry?.counter("post.search_engine.mirror.result", "status", "skipped_circuit_open")?.increment()
            logger.warn(
                "post_search_engine_mirror_skipped_circuit_open postId={} openUntilEpochMs={}",
                postId,
                circuitOpenUntilEpochMs.get(),
            )
            return
        }

        val normalizedTags =
            tags
                .asSequence()
                .map(String::trim)
                .filter(String::isNotBlank)
                .map { it.take(64) }
                .distinct()
                .take(safeMaxTags)
                .toList()

        val requestBody =
            objectMapper.writeValueAsString(
                mapOf(
                    "postId" to postId,
                    "tags" to normalizedTags,
                    "deleted" to deleted,
                ),
            )
        val requestBuilder =
            HttpRequest
                .newBuilder()
                .uri(URI.create(endpoint))
                .timeout(Duration.ofMillis(requestTimeoutMs.coerceIn(200, 15_000)))
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
        if (apiKey.isNotBlank()) {
            requestBuilder.header("Authorization", "Bearer $apiKey")
        }

        val startedAtNanos = System.nanoTime()
        val response =
            runCatching {
                httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofString())
            }.onFailure { exception ->
                val elapsedMs = (System.nanoTime() - startedAtNanos).coerceAtLeast(0L) / 1_000_000
                meterRegistry?.timer("post.search_engine.mirror.duration")?.record(elapsedMs, TimeUnit.MILLISECONDS)
                meterRegistry?.counter("post.search_engine.mirror.result", "status", "failed")?.increment()
                recordFailureAndOpenCircuitIfNeeded(postId, "transport")
                throw IllegalStateException("search_engine_mirror_transport_failed", exception)
            }.getOrThrow()

        val elapsedMs = (System.nanoTime() - startedAtNanos).coerceAtLeast(0L) / 1_000_000
        meterRegistry?.timer("post.search_engine.mirror.duration")?.record(elapsedMs, TimeUnit.MILLISECONDS)

        if (response.statusCode() !in 200..299) {
            meterRegistry?.counter("post.search_engine.mirror.result", "status", "non_success")?.increment()
            recordFailureAndOpenCircuitIfNeeded(postId, "status-${response.statusCode()}")
            logger.warn(
                "post_search_engine_mirror_non_success postId={} status={} body={}",
                postId,
                response.statusCode(),
                response.body().take(200),
            )
            throw IllegalStateException("search_engine_mirror_status_${response.statusCode()}")
        }

        consecutiveFailureCount.set(0)
        meterRegistry?.counter("post.search_engine.mirror.result", "status", "success")?.increment()
    }

    private fun isCircuitOpen(): Boolean {
        val now = System.currentTimeMillis()
        val openUntil = circuitOpenUntilEpochMs.get()
        return openUntil > now
    }

    private fun recordFailureAndOpenCircuitIfNeeded(
        postId: Long,
        reason: String,
    ) {
        val failures = consecutiveFailureCount.incrementAndGet()
        if (failures < safeFailureThreshold) return

        val nextOpenUntil = System.currentTimeMillis() + safeCircuitOpenMillis
        circuitOpenUntilEpochMs.getAndUpdate { previous -> maxOf(previous, nextOpenUntil) }
        meterRegistry?.counter("post.search_engine.mirror.circuit", "state", "opened", "reason", reason)?.increment()
        logger.warn(
            "post_search_engine_mirror_circuit_opened postId={} reason={} failures={} threshold={} openUntilEpochMs={}",
            postId,
            reason,
            failures,
            safeFailureThreshold,
            circuitOpenUntilEpochMs.get(),
        )
    }

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
