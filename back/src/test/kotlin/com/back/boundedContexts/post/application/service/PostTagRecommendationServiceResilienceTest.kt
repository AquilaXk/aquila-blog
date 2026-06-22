package com.back.boundedContexts.post.application.service

import com.back.global.cache.application.port.output.RedisKeyValuePort
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import tools.jackson.databind.ObjectMapper
import java.net.InetSocketAddress
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration

@DisplayName("PostTagRecommendationService 복원력 테스트")
class PostTagRecommendationServiceResilienceTest {
    @Test
    @DisplayName("Redis 가용성 체크 예외가 발생해도 태그 추천은 500으로 실패하지 않는다")
    fun `redis isAvailable exception does not break fail-open recommendation`() {
        val service =
            createService(
                aiEnabled = false,
                redisPort =
                    object : RedisKeyValuePort {
                        override fun isAvailable(): Boolean = throw RuntimeException("redis unavailable")

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
                    },
            )

        val result =
            service.recommend(
                title = "SSE 장애 복구 트러블슈팅",
                content = "---\n<aside>note</aside>\n프록시 장애 대응 방안",
                existingTags = listOf("SSE", "트러블 슈팅"),
                maxTags = 6,
            )

        assertThat(result.provider).isEqualTo("rule")
        assertThat(result.reason).isEqualTo("ai-disabled")
        assertThat(result.tags).doesNotContain("---")
        assertThat(result.tags).doesNotContain("aside")
    }

    @Test
    @DisplayName("규칙 태그 추천은 마크업/구분자 노이즈 토큰을 제외한다")
    fun `rule tag recommendation excludes markup noise tokens`() {
        val service = createService(aiEnabled = false, redisPort = fakeRedisPort())

        val result =
            service.recommend(
                title = "SSE 연결 복구",
                content =
                    """
                    ---
                    <aside>운영 메모</aside>
                    프록시 재시도 방안과 health check 기준
                    """.trimIndent(),
                existingTags = listOf("SSE", "트러블 슈팅"),
                maxTags = 6,
            )

        assertThat(result.tags).doesNotContain("---")
        assertThat(result.tags).doesNotContain("aside")
    }

    @Test
    @DisplayName("Gemini 태그 추천은 환경변수가 없으면 기본 비활성화된다")
    fun `gemini tag recommendation is disabled by default configuration`() {
        val applicationYaml = Files.readString(Path.of("src/main/resources/application.yaml"))

        assertThat(applicationYaml).contains("enabled: \${CUSTOM__AI__TAG__ENABLED:false}")
    }

    @Test
    @DisplayName("Gemini 요청과 캐시는 원문 개인정보와 secret을 저장하지 않는다")
    fun `gemini request and cache redact raw personal data and secrets`() {
        val redisPort = capturingRedisPort()
        val capturedBodies = mutableListOf<String>()
        val server = startGeminiServer(capturedBodies)
        val service =
            createService(
                aiEnabled = true,
                redisPort = redisPort,
                geminiApiKey = "test-key",
                geminiBaseUrl = "http://127.0.0.1:${server.address.port}/v1beta",
            )

        try {
            val result =
                service.recommend(
                    title = "담당자 secret@example.com 연락",
                    content =
                        """
                        장애 대응 담당자는 secret@example.com, 010-1234-5678 입니다.
                        내부 호출 예시는 apiKey=super-secret-token 값으로 남아 있습니다.
                        quoted secret 예시는 password="multi word secret" secret: 'quoted token value' 입니다.
                        JSON secret 예시는 {"apiKey":"json-secret-token","Authorization":"Bearer json-bearer-token"} 입니다.
                        요청 헤더 예시는 Authorization: Bearer bearer-secret-token 입니다.
                        """.trimIndent(),
                    existingTags = emptyList(),
                    maxTags = 5,
                )

            assertThat(result.provider).isEqualTo("gemini")
            assertThat(capturedBodies).hasSize(1)
            assertThat(capturedBodies.single())
                .doesNotContain("secret@example.com")
                .doesNotContain("010-1234-5678")
                .doesNotContain("super-secret-token")
                .doesNotContain("multi word secret")
                .doesNotContain("quoted token value")
                .doesNotContain("json-secret-token")
                .doesNotContain("json-bearer-token")
                .doesNotContain("bearer-secret-token")
                .contains("[redacted-email]")
                .contains("[redacted-phone]")
                .contains("apiKey=[redacted-secret]")
                .contains("Authorization=[redacted-secret]")
            assertThat(redisPort.writes.flatMap { listOf(it.key, it.value) }.joinToString("\n"))
                .doesNotContain("secret@example.com")
                .doesNotContain("010-1234-5678")
                .doesNotContain("super-secret-token")
                .doesNotContain("multi word secret")
                .doesNotContain("quoted token value")
                .doesNotContain("json-secret-token")
                .doesNotContain("json-bearer-token")
                .doesNotContain("bearer-secret-token")
        } finally {
            server.stop(0)
        }
    }

    private fun createService(
        aiEnabled: Boolean,
        redisPort: RedisKeyValuePort,
        geminiApiKey: String = "",
        geminiBaseUrl: String = "http://localhost:1/v1beta",
    ): PostTagRecommendationService =
        PostTagRecommendationService(
            aiTagEnabled = aiEnabled,
            timeoutSeconds = 6,
            maxRequestsPerMinute = 30,
            maxRequestsPerDay = 1_000,
            cacheTtlSeconds = 300,
            fallbackCacheTtlSeconds = 45,
            retryMaxAttempts = 1,
            retryDelayMs = 250,
            maxTagLength = 24,
            geminiApiKey = geminiApiKey,
            geminiModel = "gemini-2.5-flash",
            geminiBaseUrl = geminiBaseUrl,
            redisKeyValuePort = redisPort,
            objectMapper = ObjectMapper(),
            meterRegistry = null,
        )

    private data class RedisWrite(
        val key: String,
        val value: String,
    )

    private class CapturingRedisPort : RedisKeyValuePort {
        val writes = mutableListOf<RedisWrite>()

        override fun isAvailable(): Boolean = true

        override fun get(key: String): String? = null

        override fun set(
            key: String,
            value: String,
            ttl: Duration?,
        ) {
            writes += RedisWrite(key, value)
        }

        override fun increment(key: String): Long? = 1

        override fun expire(
            key: String,
            ttl: Duration,
        ): Boolean = true

        override fun delete(keys: Collection<String>): Long = 0

        override fun keys(pattern: String): Set<String> = emptySet()
    }

    private fun capturingRedisPort() = CapturingRedisPort()

    private fun startGeminiServer(capturedBodies: MutableList<String>): HttpServer {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/v1beta/models/gemini-2.5-flash:generateContent") { exchange ->
            val requestBody = exchange.requestBody.bufferedReader(Charsets.UTF_8).use { it.readText() }
            capturedBodies += requestBody
            val response =
                """
                {
                  "candidates": [
                    {
                      "content": {
                        "parts": [
                          {
                            "text": "{\"tags\":[\"Kotlin\",\"보안\",\"개인정보\"]}"
                          }
                        ]
                      }
                    }
                  ],
                  "modelVersion": "gemini-test"
                }
                """.trimIndent()
            val responseBytes = response.toByteArray(Charsets.UTF_8)

            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, responseBytes.size.toLong())
            exchange.responseBody.use { it.write(responseBytes) }
        }
        server.start()
        return server
    }

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
}
