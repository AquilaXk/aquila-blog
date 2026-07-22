package com.back.global.storage.metrics

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class CloudMediaMetricsTest {
    @Test
    fun `세션 전이·part·재생·token·storage 메트릭을 기록한다`() {
        val registry = SimpleMeterRegistry()

        CloudMediaMetrics.recordSessionTransition(registry, from = "INITIATING", to = "IN_PROGRESS")
        CloudMediaMetrics.recordSessionTransition(registry, from = "COMPLETING", to = "FAILED")
        CloudMediaMetrics.recordPartUpload(registry, result = "success", durationNanos = 1_000_000, bytes = 1024)
        CloudMediaMetrics.recordPlaybackRequest(
            registry,
            statusClass = "2xx",
            range = "partial",
            endpoint = "content",
            bytesSent = 2048,
        )
        CloudMediaMetrics.recordTokenOperation(registry, op = "issued")
        CloudMediaMetrics.recordStorageOperation(registry, op = "head")

        assertThat(
            registry
                .counter(
                    CloudMediaMetrics.UPLOAD_SESSION_TRANSITIONS,
                    "from",
                    "INITIATING",
                    "to",
                    "IN_PROGRESS",
                ).count(),
        ).isEqualTo(1.0)
        assertThat(
            registry
                .counter(
                    CloudMediaMetrics.UPLOAD_SESSION_TRANSITIONS,
                    "from",
                    "COMPLETING",
                    "to",
                    "FAILED",
                ).count(),
        ).isEqualTo(1.0)
        assertThat(registry.timer(CloudMediaMetrics.UPLOAD_PART_DURATION, "result", "success").count()).isEqualTo(1)
        assertThat(registry.summary(CloudMediaMetrics.UPLOAD_PART_BYTES).totalAmount()).isEqualTo(1024.0)
        assertThat(
            registry
                .counter(
                    CloudMediaMetrics.PLAYBACK_REQUESTS,
                    "status_class",
                    "2xx",
                    "range",
                    "partial",
                    "endpoint",
                    "content",
                ).count(),
        ).isEqualTo(1.0)
        assertThat(
            registry.counter(CloudMediaMetrics.PLAYBACK_BYTES_SENT, "endpoint", "content").count(),
        ).isEqualTo(2048.0)
        assertThat(
            registry.counter(CloudMediaMetrics.PLAYBACK_TOKEN_OPERATIONS, "op", "issued").count(),
        ).isEqualTo(1.0)
        assertThat(
            registry.counter(CloudMediaMetrics.STORAGE_OPERATIONS, "op", "head").count(),
        ).isEqualTo(1.0)
    }
}
