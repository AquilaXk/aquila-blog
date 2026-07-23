package com.back.boundedContexts.post.adapter.web

import jakarta.servlet.http.HttpServletResponse
import org.springframework.stereotype.Component
import java.util.Locale

@Component
class PostPublicReadServerTimingWriter {
    fun appendMetric(
        response: HttpServletResponse,
        metric: String,
    ) {
        val current = response.getHeader("Server-Timing")
        if (current.isNullOrBlank()) {
            response.setHeader("Server-Timing", metric)
            return
        }
        response.setHeader("Server-Timing", "$current, $metric")
    }

    fun appendOriginTiming(
        response: HttpServletResponse,
        startedAtNanos: Long,
        description: String,
    ) {
        val elapsedMs = ((System.nanoTime() - startedAtNanos).coerceAtLeast(0L)).toDouble() / 1_000_000.0
        val durationToken = String.format(Locale.US, "%.1f", elapsedMs)
        appendMetric(response, "origin;dur=$durationToken;desc=\"$description\"")
    }
}
