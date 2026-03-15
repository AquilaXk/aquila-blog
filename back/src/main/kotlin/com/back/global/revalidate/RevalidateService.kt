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

@Service
class RevalidateService(
    @Value("\${custom.revalidate.url:}")
    private val revalidateUrl: String,
    @Value("\${custom.revalidate.token:}")
    private val revalidateToken: String,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val httpClient =
        HttpClient
            .newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build()

    fun revalidateHome() = revalidatePath("/")

    fun revalidatePath(path: String) {
        if (revalidateUrl.isBlank() || revalidateToken.isBlank()) return
        val normalizedPath =
            path
                .trim()
                .takeIf { it.startsWith("/") && !it.startsWith("//") }
                ?: "/"

        val req =
            HttpRequest
                .newBuilder()
                .uri(URI.create(revalidateUrl))
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
            }
        }.onFailure { exception ->
            // Keep post write/modify/delete path non-blocking even if revalidate fails.
            log.warn("Revalidate request failed", exception)
        }
    }
}
