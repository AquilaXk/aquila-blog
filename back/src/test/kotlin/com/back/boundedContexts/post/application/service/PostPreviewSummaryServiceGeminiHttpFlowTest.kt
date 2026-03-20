package com.back.boundedContexts.post.application.service

import com.back.global.cache.application.port.output.RedisKeyValuePort
import com.sun.net.httpserver.Headers
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.concurrent.atomic.AtomicInteger

@DisplayName("PostPreviewSummaryService Gemini HTTP 통합 테스트")
class PostPreviewSummaryServiceGeminiHttpFlowTest {
    private val objectMapper = ObjectMapper()

    @Test
    @DisplayName("Gemini 요청에 헤더/URI/프롬프트와 strict JSON 스키마를 포함하고 성공 응답을 수신한다")
    fun `gemini request payload and success response end to end`() {
        val requests = mutableListOf<CapturedRequest>()
        withGeminiServer(
            requests = requests,
            responder = { exchange, _ ->
                respondJson(
                    exchange = exchange,
                    statusCode = 200,
                    payload =
                        geminiCandidatePayload(
                            summaryText = """{"summary":"SSE 알림 중단 원인과 프록시 설정 개선 과정을 정리했다."}""",
                            modelVersion = "gemini-2.5-flash",
                        ),
                )
            },
        ) { baseUrl, callCount ->
            val service = createService(baseUrl = baseUrl)

            val result =
                service.generate(
                    title = "SSE 알림 트러블슈팅",
                    content = "SSE가 중간에 멈추는 문제를 프록시 버퍼링과 재연결 설정 관점에서 분석했다.",
                    maxLength = 150,
                )

            assertThat(result.provider).isEqualTo("gemini")
            assertThat(result.reason).isNull()
            assertThat(result.summary).contains("SSE 알림")
            assertThat(callCount.get()).isEqualTo(1)
            assertThat(requests).hasSize(1)

            val request = requests.first()
            assertThat(request.path).isEqualTo("/v1beta/models/gemini-2.5-flash:generateContent")
            assertThat(headerValue(request.headers, "x-goog-api-key")).isEqualTo("test-key")

            val payload = objectMapper.readTree(request.body)
            val generationConfig = payload.path("generationConfig")
            assertThat(generationConfig.path("responseMimeType").asText()).isEqualTo("application/json")
            assertThat(generationConfig.has("responseSchema")).isTrue()

            val prompt =
                payload
                    .path("contents")
                    .path(0)
                    .path("parts")
                    .path(0)
                    .path("text")
                    .asText("")
            assertThat(prompt).contains("<제목>")
            assertThat(prompt).contains("SSE 알림 트러블슈팅")
            assertThat(prompt).contains("<본문>")
        }
    }

    @Test
    @DisplayName("strict empty 이후 relaxed 재시도에서 복구되면 Gemini 요약을 반영한다")
    fun `strict empty then relaxed retry success`() {
        val requests = mutableListOf<CapturedRequest>()
        withGeminiServer(
            requests = requests,
            responder = { exchange, callNumber ->
                if (callNumber == 1) {
                    respondJson(
                        exchange = exchange,
                        statusCode = 200,
                        payload =
                            geminiCandidatePayload(
                                summaryText = """{"summary":""}""",
                                modelVersion = "gemini-2.5-flash",
                            ),
                    )
                } else {
                    respondJson(
                        exchange = exchange,
                        statusCode = 200,
                        payload =
                            geminiCandidatePayload(
                                summaryText = "SSE 알림 중단 원인을 프록시 버퍼링과 재연결 설정으로 진단하고 해결 과정을 요약했다.",
                                modelVersion = "gemini-2.5-pro",
                            ),
                    )
                }
            },
        ) { baseUrl, callCount ->
            val service = createService(baseUrl = baseUrl)
            val result =
                service.generate(
                    title = "SSE 점검",
                    content = "strict 응답이 빈 경우 relaxed 재시도로 회복되어야 한다.",
                    maxLength = 150,
                )

            assertThat(result.provider).isEqualTo("gemini")
            assertThat(result.reason).isNull()
            assertThat(result.summary).contains("프록시 버퍼링")
            assertThat(callCount.get()).isEqualTo(2)
            assertThat(requests).hasSize(2)

            val firstPayload = objectMapper.readTree(requests[0].body).path("generationConfig")
            assertThat(firstPayload.has("responseMimeType")).isTrue()
            assertThat(firstPayload.has("responseSchema")).isTrue()

            val secondPayload = objectMapper.readTree(requests[1].body).path("generationConfig")
            assertThat(secondPayload.has("responseMimeType")).isFalse()
            assertThat(secondPayload.has("responseSchema")).isFalse()
        }
    }

    @Test
    @DisplayName("동일 입력에서 empty-summary가 누적되면 repeated-failure-signature로 임시 우회한다")
    fun `repeated failure signature bypasses upstream`() {
        val requests = mutableListOf<CapturedRequest>()
        withGeminiServer(
            requests = requests,
            responder = { exchange, _ ->
                respondJson(
                    exchange = exchange,
                    statusCode = 200,
                    payload =
                        geminiCandidatePayload(
                            summaryText = """{"summary":""}""",
                            modelVersion = "gemini-2.5-flash",
                        ),
                )
            },
        ) { baseUrl, callCount ->
            val service = createService(baseUrl = baseUrl)
            val title = "반복 실패 시그니처"
            val content = "동일 입력에서 empty-summary가 반복될 때 AI 호출 우회 동작을 검증한다."

            repeat(2) {
                val result =
                    service.generate(
                        title = title,
                        content = content,
                        maxLength = 150,
                    )
                assertThat(result.provider).isEqualTo("rule")
                assertThat(result.reason).isEqualTo("empty-summary")
                clearInMemorySummaryCache(service)
            }

            val bypassed =
                service.generate(
                    title = title,
                    content = content,
                    maxLength = 150,
                )
            assertThat(bypassed.provider).isEqualTo("rule")
            assertThat(bypassed.reason).isEqualTo("repeated-failure-signature")
            assertThat(callCount.get()).isEqualTo(4)
            assertThat(requests).hasSize(4)
        }
    }

    @Test
    @DisplayName("본문이 매우 길거나 코드펜스가 많으면 relaxed 모드 요청을 우선 시도한다")
    fun `long markdown heavy content prefers relaxed first`() {
        val requests = mutableListOf<CapturedRequest>()
        withGeminiServer(
            requests = requests,
            responder = { exchange, _ ->
                respondJson(
                    exchange = exchange,
                    statusCode = 200,
                    payload =
                        geminiCandidatePayload(
                            summaryText = "SSE 알림 멈춤 현상의 원인을 점검하고 프록시 버퍼링 및 재연결 정책 조정으로 복구한 과정을 정리했다.",
                            modelVersion = "gemini-2.5-flash",
                        ),
                )
            },
        ) { baseUrl, callCount ->
            val service = createService(baseUrl = baseUrl)
            val longMarkdownContent =
                buildString {
                    repeat(420) { index ->
                        append("### 섹션 $index\n")
                        append("```kotlin\n")
                        append("fun retry$index() = Unit\n")
                        append("```\n")
                        append("![이미지](https://example.com/$index.png)\n")
                        append("[관련링크](https://example.com/docs/$index)\n")
                        append("SSE 알림이 잠깐 멈추는 현상을 분석했다. ")
                    }
                }

            val result =
                service.generate(
                    title = "대형 마크다운 본문",
                    content = longMarkdownContent,
                    maxLength = 150,
                )

            assertThat(result.provider).isEqualTo("gemini")
            assertThat(result.reason).isNull()
            assertThat(callCount.get()).isEqualTo(1)
            assertThat(requests).hasSize(1)

            val generationConfig = objectMapper.readTree(requests[0].body).path("generationConfig")
            assertThat(generationConfig.has("responseMimeType")).isFalse()
            assertThat(generationConfig.has("responseSchema")).isFalse()

            val prompt =
                objectMapper
                    .readTree(requests[0].body)
                    .path("contents")
                    .path(0)
                    .path("parts")
                    .path(0)
                    .path("text")
                    .asText("")
            assertThat(prompt).doesNotContain("```")
        }
    }

    @Test
    @DisplayName("429 RESOURCE_EXHAUSTED는 quota-exhausted로 분류되고 즉시 회로 차단된다")
    fun `quota exhausted opens circuit and skips subsequent upstream call`() {
        val requests = mutableListOf<CapturedRequest>()
        withGeminiServer(
            requests = requests,
            responder = { exchange, _ ->
                respondJson(
                    exchange = exchange,
                    statusCode = 429,
                    payload = """{"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for this API."}}""",
                )
            },
        ) { baseUrl, callCount ->
            val service = createService(baseUrl = baseUrl)

            val first =
                service.generate(
                    title = "quota-1",
                    content = "첫 번째 요청은 quota exhausted를 반환한다.",
                    maxLength = 150,
                )
            assertThat(first.provider).isEqualTo("rule")
            assertThat(first.reason).isEqualTo("quota-exhausted")

            val second =
                service.generate(
                    title = "quota-2",
                    content = "두 번째 요청은 회로 차단으로 업스트림 호출 없이 fallback 된다.",
                    maxLength = 150,
                )
            assertThat(second.provider).isEqualTo("rule")
            assertThat(second.reason).isEqualTo("rate-limited-or-circuit-open")
            assertThat(callCount.get()).isEqualTo(1)
        }
    }

    @Test
    @DisplayName("일반 403 응답은 status-403 reason으로 fallback 처리된다")
    fun `generic 403 falls back with status reason`() {
        val requests = mutableListOf<CapturedRequest>()
        withGeminiServer(
            requests = requests,
            responder = { exchange, _ ->
                respondJson(
                    exchange = exchange,
                    statusCode = 403,
                    payload = """{"error":{"status":"PERMISSION_DENIED","message":"Forbidden"}}""",
                )
            },
        ) { baseUrl, _ ->
            val service = createService(baseUrl = baseUrl)
            val result =
                service.generate(
                    title = "status-403",
                    content = "일반 권한 오류는 status 코드 reason으로 남겨야 한다.",
                    maxLength = 150,
                )
            assertThat(result.provider).isEqualTo("rule")
            assertThat(result.reason).isEqualTo("status-403")
            assertThat(requests).hasSize(1)
        }
    }

    @Test
    @DisplayName("일반 500 응답은 status-500 reason으로 fallback 처리된다")
    fun `generic 500 falls back with status reason`() {
        val requests = mutableListOf<CapturedRequest>()
        withGeminiServer(
            requests = requests,
            responder = { exchange, _ ->
                respondJson(
                    exchange = exchange,
                    statusCode = 500,
                    payload = """{"error":{"status":"INTERNAL","message":"internal"}}""",
                )
            },
        ) { baseUrl, _ ->
            val service = createService(baseUrl = baseUrl, retryMaxAttempts = 0)
            val result =
                service.generate(
                    title = "status-500",
                    content = "서버 오류는 status-500 reason으로 남겨야 한다.",
                    maxLength = 150,
                )
            assertThat(result.provider).isEqualTo("rule")
            assertThat(result.reason).isEqualTo("status-500")
            assertThat(requests).hasSize(1)
        }
    }

    @Test
    @DisplayName("transport 실패(연결 거부)는 transport reason으로 fallback 처리된다")
    fun `transport failure falls back with transport reason`() {
        val unusedPort = findUnusedPort()
        val service =
            createService(
                baseUrl = "http://127.0.0.1:$unusedPort/v1beta",
                timeoutSeconds = 1,
                retryMaxAttempts = 0,
            )

        val result =
            service.generate(
                title = "transport",
                content = "네트워크 연결 실패 시 transport reason이 내려와야 한다.",
                maxLength = 150,
            )

        assertThat(result.provider).isEqualTo("rule")
        assertThat(result.reason).isEqualTo("transport")
    }

    private fun withGeminiServer(
        requests: MutableList<CapturedRequest>,
        responder: (exchange: HttpExchange, callNumber: Int) -> Unit,
        block: (baseUrl: String, callCount: AtomicInteger) -> Unit,
    ) {
        val callCount = AtomicInteger(0)
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/v1beta/models/gemini-2.5-flash:generateContent") { exchange ->
            val requestBody = exchange.requestBody.bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
            requests +=
                CapturedRequest(
                    path = exchange.requestURI.path,
                    headers = exchange.requestHeaders,
                    body = requestBody,
                )
            responder(exchange, callCount.incrementAndGet())
        }
        server.start()

        try {
            val baseUrl = "http://127.0.0.1:${server.address.port}/v1beta"
            block(baseUrl, callCount)
        } finally {
            server.stop(0)
        }
    }

    private fun respondJson(
        exchange: HttpExchange,
        statusCode: Int,
        payload: String,
    ) {
        val bytes = payload.toByteArray(StandardCharsets.UTF_8)
        exchange.responseHeaders.add("Content-Type", "application/json")
        exchange.sendResponseHeaders(statusCode, bytes.size.toLong())
        exchange.responseBody.use { output -> output.write(bytes) }
    }

    private fun geminiCandidatePayload(
        summaryText: String,
        modelVersion: String,
    ): String =
        objectMapper.writeValueAsString(
            mapOf(
                "candidates" to
                    listOf(
                        mapOf(
                            "content" to
                                mapOf(
                                    "parts" to listOf(mapOf("text" to summaryText)),
                                ),
                        ),
                    ),
                "modelVersion" to modelVersion,
            ),
        )

    private fun headerValue(
        headers: Headers,
        key: String,
    ): String? =
        headers.entries
            .firstOrNull { it.key.equals(key, ignoreCase = true) }
            ?.value
            ?.firstOrNull()

    private fun findUnusedPort(): Int = ServerSocket(0).use { socket -> socket.localPort }

    private fun clearInMemorySummaryCache(service: PostPreviewSummaryService) {
        val field = PostPreviewSummaryService::class.java.getDeclaredField("summaryCache")
        field.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val cache = field.get(service) as MutableMap<Any?, Any?>
        cache.clear()
    }

    private fun createService(
        baseUrl: String,
        timeoutSeconds: Long = 3,
        retryMaxAttempts: Int = 0,
    ): PostPreviewSummaryService =
        PostPreviewSummaryService(
            aiSummaryEnabled = true,
            timeoutSeconds = timeoutSeconds,
            maxRequestsPerMinute = 100,
            maxRequestsPerDay = 1000,
            cacheTtlSeconds = 120,
            fallbackCacheTtlSeconds = 30,
            quotaFallbackCacheTtlSeconds = 120,
            retryMaxAttempts = retryMaxAttempts,
            retryBaseDelayMs = 50,
            retryMaxDelayMs = 200,
            circuitFailureThreshold = 5,
            circuitOpenSeconds = 30,
            quotaCircuitOpenSeconds = 300,
            failureSignatureThreshold = 2,
            failureSignatureTtlSeconds = 900,
            failureSignatureOpenSeconds = 300,
            adaptiveRelaxedFirstContentLength = 9000,
            adaptiveRelaxedFirstCodeFenceCount = 3,
            geminiApiKey = "test-key",
            geminiModel = "gemini-2.5-flash",
            geminiBaseUrl = baseUrl,
            redisKeyValuePort = fakeRedisPort(),
            objectMapper = objectMapper,
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

    private data class CapturedRequest(
        val path: String,
        val headers: Headers,
        val body: String,
    ) {
        fun bodyAsJson(mapper: ObjectMapper): JsonNode = mapper.readTree(body)
    }
}
