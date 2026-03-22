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
    private val objectMapper: ObjectMapper,
    private val meterRegistry: MeterRegistry? = null,
) {
    private val logger = LoggerFactory.getLogger(PostSearchEngineMirrorService::class.java)
    private val safeMaxTags = maxTags.coerceIn(1, 128)
    private val normalizedConnectTimeoutMs = connectTimeoutMs.coerceIn(100, 10_000)
    private val httpClient = sharedHttpClient(normalizedConnectTimeoutMs)

    fun mirror(
        postId: Long,
        tags: Collection<String>,
        deleted: Boolean,
    ) {
        if (!enabled) return
        if (endpoint.isBlank()) return

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
                throw IllegalStateException("search_engine_mirror_transport_failed", exception)
            }.getOrThrow()

        val elapsedMs = (System.nanoTime() - startedAtNanos).coerceAtLeast(0L) / 1_000_000
        meterRegistry?.timer("post.search_engine.mirror.duration")?.record(elapsedMs, TimeUnit.MILLISECONDS)

        if (response.statusCode() !in 200..299) {
            meterRegistry?.counter("post.search_engine.mirror.result", "status", "non_success")?.increment()
            logger.warn(
                "post_search_engine_mirror_non_success postId={} status={} body={}",
                postId,
                response.statusCode(),
                response.body().take(200),
            )
            throw IllegalStateException("search_engine_mirror_status_${response.statusCode()}")
        }

        meterRegistry?.counter("post.search_engine.mirror.result", "status", "success")?.increment()
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
