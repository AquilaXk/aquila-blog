package com.back.global.revalidate

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
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(2))
        .build()

    fun revalidateHome() {
        if (revalidateUrl.isBlank() || revalidateToken.isBlank()) return

        val req = HttpRequest.newBuilder()
            .uri(URI.create(revalidateUrl))
            .timeout(Duration.ofSeconds(3))
            .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
            .header("x-revalidate-token", revalidateToken)
            .POST(HttpRequest.BodyPublishers.ofString("""{"path":"/"}"""))
            .build()

        runCatching {
            httpClient.send(req, HttpResponse.BodyHandlers.discarding())
        }.onFailure {
            // Keep post write/modify/delete path non-blocking even if revalidate fails.
            println("[revalidate] failed: ${it.message}")
        }
    }
}

