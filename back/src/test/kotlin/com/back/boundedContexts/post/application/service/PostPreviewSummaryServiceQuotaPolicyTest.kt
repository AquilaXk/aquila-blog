package com.back.boundedContexts.post.application.service

import com.back.global.cache.application.port.output.RedisKeyValuePort
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import tools.jackson.databind.ObjectMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpHeaders
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.Optional
import javax.net.ssl.SSLSession

@DisplayName("PostPreviewSummaryService quota 처리 테스트")
class PostPreviewSummaryServiceQuotaPolicyTest {
    @Test
    @DisplayName("429 + RESOURCE_EXHAUSTED 응답은 quota-exhausted reason으로 분류한다")
    fun `quota exhausted response is mapped to dedicated reason`() {
        val service = createService()
        val response =
            fakeResponse(
                status = 429,
                body = """{"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for this API."}}""",
            )

        val reason = invokeResolveProviderErrorReason(service, response)

        assertThat(reason).isEqualTo("quota-exhausted")
    }

    @Test
    @DisplayName("일반 403 오류는 status 코드 reason으로 유지한다")
    fun `generic 403 response keeps status reason`() {
        val service = createService()
        val response =
            fakeResponse(
                status = 403,
                body = """{"error":{"status":"PERMISSION_DENIED","message":"Forbidden"}}""",
            )

        val reason = invokeResolveProviderErrorReason(service, response)

        assertThat(reason).isEqualTo("status-403")
    }

    private fun createService(): PostPreviewSummaryService =
        PostPreviewSummaryService(
            aiSummaryEnabled = true,
            timeoutSeconds = 7,
            maxRequestsPerMinute = 20,
            maxRequestsPerDay = 500,
            cacheTtlSeconds = 300,
            fallbackCacheTtlSeconds = 45,
            quotaFallbackCacheTtlSeconds = 300,
            retryMaxAttempts = 2,
            retryBaseDelayMs = 350,
            retryMaxDelayMs = 2500,
            circuitFailureThreshold = 5,
            circuitOpenSeconds = 90,
            quotaCircuitOpenSeconds = 600,
            failureSignatureThreshold = 2,
            failureSignatureTtlSeconds = 900,
            failureSignatureOpenSeconds = 300,
            adaptiveRelaxedFirstContentLength = 9000,
            adaptiveRelaxedFirstCodeFenceCount = 3,
            geminiApiKey = "test-key",
            geminiModel = "gemini-2.5-flash",
            geminiBaseUrl = "http://localhost:1/v1beta",
            redisKeyValuePort = fakeRedisPort(),
            objectMapper = ObjectMapper(),
        )

    private fun fakeRedisPort(): RedisKeyValuePort =
        object : RedisKeyValuePort {
            override fun isAvailable(): Boolean = false

            override fun get(key: String): String? = null

            override fun set(
                key: String,
                value: String,
                ttl: Duration?,
            ) {}

            override fun increment(key: String): Long? = null

            override fun expire(
                key: String,
                ttl: Duration,
            ): Boolean = false

            override fun delete(keys: Collection<String>): Long = 0

            override fun keys(pattern: String): Set<String> = emptySet()
        }

    private fun fakeResponse(
        status: Int,
        body: String,
    ): HttpResponse<String> =
        object : HttpResponse<String> {
            override fun statusCode(): Int = status

            override fun request(): HttpRequest = HttpRequest.newBuilder().uri(URI.create("https://example.com")).build()

            override fun previousResponse(): Optional<HttpResponse<String>> = Optional.empty()

            override fun headers(): HttpHeaders = HttpHeaders.of(emptyMap()) { _, _ -> true }

            override fun body(): String = body

            override fun sslSession(): Optional<SSLSession> = Optional.empty()

            override fun uri(): URI = URI.create("https://example.com")

            override fun version(): HttpClient.Version = HttpClient.Version.HTTP_1_1
        }

    private fun invokeResolveProviderErrorReason(
        service: PostPreviewSummaryService,
        response: HttpResponse<String>,
    ): String {
        val method =
            PostPreviewSummaryService::class.java.getDeclaredMethod(
                "resolveProviderErrorReason",
                HttpResponse::class.java,
            )
        method.isAccessible = true
        return method.invoke(service, response) as String
    }
}
