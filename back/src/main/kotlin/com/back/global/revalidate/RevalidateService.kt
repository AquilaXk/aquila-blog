package com.back.global.revalidate

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * RevalidateService는 글로벌 공통 정책을 담당하는 구성요소입니다.
 * 모듈 간 중복을 줄이고 공통 규칙을 일관되게 적용하기 위해 분리되었습니다.
 */

@Service
class RevalidateService(
    @Value("\${custom.revalidate.url:}")
    private val revalidateUrl: String,
    @Value("\${custom.revalidate.token:}")
    private val revalidateToken: String,
    private val httpClient: HttpClient = SHARED_HTTP_CLIENT,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun revalidateHome() = revalidatePath("/")

    /**
     * 데이터 동기화 또는 리밸리데이션 요청을 조정해 최신 상태를 유지합니다.
     * 운영 환경에서의 예외/경계 조건을 고려해 안정적으로 동작하도록 설계되었습니다.
     */
    fun revalidatePath(path: String) {
        if (revalidateUrl.isBlank() || revalidateToken.isBlank()) return
        val revalidateUri =
            runCatching { URI.create(revalidateUrl) }.getOrElse { exception ->
                log.warn("Invalid revalidate url: {}", revalidateUrl, exception)
                return
            }
        val normalizedPath =
            path
                .trim()
                .takeIf { it.startsWith("/") && !it.startsWith("//") }
                ?: "/"

        val req =
            HttpRequest
                .newBuilder()
                .uri(revalidateUri)
                .timeout(Duration.ofSeconds(3))
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .header("x-revalidate-token", revalidateToken)
                .POST(HttpRequest.BodyPublishers.ofString("""{"path":"$normalizedPath"}"""))
                .build()

        runCatching {
            httpClient.send(req, HttpResponse.BodyHandlers.discarding())
        }.onSuccess { response ->
            if (response.statusCode() >= 400) {
                log.warn("Revalidate request returned non-success status: {}", response.statusCode())
                return@onSuccess
            }
            warmPath(revalidateUri, normalizedPath)
        }.onFailure { exception ->
            // revalidate가 실패해도 글 작성/수정/삭제 요청 경로는 비차단으로 유지한다.
            log.warn("Revalidate request failed", exception)
        }
    }

    private fun warmPath(
        revalidateUri: URI,
        normalizedPath: String,
    ) {
        val warmUri =
            runCatching { revalidateUri.resolve(normalizedPath) }.getOrElse { exception ->
                log.warn("Warm-up uri resolve failed: {}", normalizedPath, exception)
                return
            }

        val warmRequest =
            HttpRequest
                .newBuilder()
                .uri(warmUri)
                .timeout(Duration.ofSeconds(3))
                .GET()
                .build()

        runCatching {
            httpClient.send(warmRequest, HttpResponse.BodyHandlers.discarding())
        }.onSuccess { response ->
            if (response.statusCode() >= 500) {
                log.warn(
                    "Warm-up request returned server-error status: {} path={}",
                    response.statusCode(),
                    normalizedPath,
                )
            }
        }.onFailure { exception ->
            log.warn("Warm-up request failed: path={}", normalizedPath, exception)
        }
    }

    companion object {
        private val SHARED_HTTP_CLIENT: HttpClient =
            HttpClient
                .newBuilder()
                .connectTimeout(Duration.ofSeconds(2))
                .build()
    }
}
