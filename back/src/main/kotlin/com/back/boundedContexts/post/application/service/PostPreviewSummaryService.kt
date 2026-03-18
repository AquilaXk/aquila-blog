package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.dto.PostPreviewExtractor
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
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

@Service
class PostPreviewSummaryService(
    @param:Value("\${custom.ai.summary.enabled:false}")
    private val aiSummaryEnabled: Boolean,
    @param:Value("\${custom.ai.summary.timeoutSeconds:7}")
    private val timeoutSeconds: Long,
    @param:Value("\${custom.ai.summary.gemini.apiKey:}")
    private val geminiApiKey: String,
    @param:Value("\${custom.ai.summary.gemini.model:gemini-2.5-flash}")
    private val geminiModel: String,
    private val objectMapper: ObjectMapper,
) {
    data class SummaryResult(
        val summary: String,
        val provider: String,
        val model: String?,
    )

    private val log = LoggerFactory.getLogger(javaClass)
    private val httpClient =
        HttpClient
            .newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build()

    fun generate(
        title: String,
        content: String,
        maxLength: Int,
    ): SummaryResult {
        val fallback = fallbackSummary(content, maxLength)
        val normalizedTitle = title.trim()

        if (!aiSummaryEnabled) {
            return SummaryResult(summary = fallback, provider = "rule", model = null)
        }

        val normalizedApiKey = geminiApiKey.trim()
        if (normalizedApiKey.isEmpty()) {
            return SummaryResult(summary = fallback, provider = "rule", model = null)
        }

        val normalizedModel = sanitizeModel(geminiModel)
        val prompt =
            buildPrompt(
                title = normalizedTitle,
                content = content,
                maxLength = maxLength,
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

        val responseBody =
            runCatching {
                val request =
                    HttpRequest
                        .newBuilder()
                        .uri(buildGeminiUri(normalizedModel, normalizedApiKey))
                        .timeout(Duration.ofSeconds(timeoutSeconds.coerceIn(3, 20)))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody)))
                        .build()

                httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            }.onFailure { exception ->
                log.warn("Gemini summary request failed", exception)
            }.getOrNull()

        if (responseBody == null || responseBody.statusCode() >= 400) {
            if (responseBody != null) {
                log.warn("Gemini summary returned non-success status: {}", responseBody.statusCode())
            }
            return SummaryResult(summary = fallback, provider = "rule", model = null)
        }

        val aiSummary =
            runCatching {
                val root = objectMapper.readTree(responseBody.body())
                extractSummaryText(root)
            }.onFailure { exception ->
                log.warn("Gemini summary response parse failed", exception)
            }.getOrNull()

        val normalizedAiSummary = normalizeSummary(aiSummary, maxLength)
        if (normalizedAiSummary.isBlank()) {
            return SummaryResult(summary = fallback, provider = "rule", model = null)
        }

        return SummaryResult(summary = normalizedAiSummary, provider = "gemini", model = normalizedModel)
    }

    private fun fallbackSummary(
        content: String,
        maxLength: Int,
    ): String = truncateSummary(PostPreviewExtractor.makeSummary(content), maxLength)

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

        return """
        아래 기술 블로그 글을 한국어로 요약하세요.
        출력 규칙:
        - 결과는 정확히 한 문단
        - 최대 ${maxLength}자
        - 핵심 문제/원인/해결/결과를 우선
        - 군더더기 인사말, 자기언급, 불필요한 수식어 금지
        - 마크다운, 번호 목록, 따옴표, "요약:" 접두사 금지

        제목:
        $normalizedTitle

        본문:
        $normalizedContent
        """.trimIndent()
    }

    private fun buildGeminiUri(
        model: String,
        apiKey: String,
    ): URI {
        val encodedApiKey = URLEncoder.encode(apiKey, StandardCharsets.UTF_8)
        return URI.create("https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$encodedApiKey")
    }

    private fun sanitizeModel(raw: String): String {
        val normalized = raw.trim()
        return if (normalized.matches(Regex("[a-zA-Z0-9._-]+"))) {
            normalized
        } else {
            "gemini-2.5-flash"
        }
    }

    @Suppress("DEPRECATION")
    private fun extractSummaryText(root: JsonNode): String {
        val candidates = root.path("candidates")
        if (!candidates.isArray || candidates.isEmpty) return ""

        for (candidate in candidates) {
            val parts = candidate.path("content").path("parts")
            if (!parts.isArray || parts.isEmpty) continue

            for (part in parts) {
                val text = part.path("text").textValue()?.trim().orEmpty()
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

    private fun truncateSummary(
        value: String,
        maxLength: Int,
    ): String {
        if (value.length <= maxLength) return value
        return "${value.take(maxLength).trim()}..."
    }

    companion object {
        private const val MAX_PROMPT_CONTENT_LENGTH = 8_000
    }
}
