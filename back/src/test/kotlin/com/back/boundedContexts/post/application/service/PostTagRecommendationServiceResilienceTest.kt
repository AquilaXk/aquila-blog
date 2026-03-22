package com.back.boundedContexts.post.application.service

import com.back.global.cache.application.port.output.RedisKeyValuePort
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import tools.jackson.databind.ObjectMapper
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

    private fun createService(
        aiEnabled: Boolean,
        redisPort: RedisKeyValuePort,
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
            geminiApiKey = "",
            geminiModel = "gemini-2.5-flash",
            geminiBaseUrl = "http://localhost:1/v1beta",
            redisKeyValuePort = redisPort,
            objectMapper = ObjectMapper(),
            meterRegistry = null,
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
}
