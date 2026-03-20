package com.back.boundedContexts.post.application.service

import com.back.global.cache.application.port.output.RedisKeyValuePort
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import tools.jackson.databind.ObjectMapper
import java.time.Duration

@DisplayName("PostPreviewSummaryService 품질 판정 테스트")
class PostPreviewSummaryServiceQualityTest {
    @Test
    @DisplayName("균형 잡힌 큰따옴표가 포함된 정상 요약은 low-quality로 판정하지 않는다")
    fun `balanced quotes summary is not low quality`() {
        val service = createService()

        val result =
            invokeIsLowQualityAiSummary(
                service = service,
                aiSummary = """SSE 알림 "잠깐 멈춤" 이슈의 원인과 프록시/재연결 설정 개선 과정을 정리했다.""",
                fallbackSummary = "SSE 알림 이슈를 정리했다.",
                maxLength = 150,
            )

        assertThat(result).isFalse()
    }

    @Test
    @DisplayName("닫히지 않은 큰따옴표가 남은 요약은 low-quality로 판정한다")
    fun `unbalanced quotes summary is low quality`() {
        val service = createService()

        val result =
            invokeIsLowQualityAiSummary(
                service = service,
                aiSummary = """SSE 알림 "잠깐 멈춤 이슈의 원인과 개선 과정을 정리했다.""",
                fallbackSummary = "SSE 알림 이슈를 정리했다.",
                maxLength = 150,
            )

        assertThat(result).isTrue()
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

    private fun invokeIsLowQualityAiSummary(
        service: PostPreviewSummaryService,
        aiSummary: String,
        fallbackSummary: String,
        maxLength: Int,
    ): Boolean {
        val method =
            PostPreviewSummaryService::class.java.getDeclaredMethod(
                "isLowQualityAiSummary",
                String::class.java,
                String::class.java,
                Integer.TYPE,
            )
        method.isAccessible = true
        return method.invoke(service, aiSummary, fallbackSummary, maxLength) as Boolean
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
