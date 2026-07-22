package com.back.global.storage.metrics

import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import java.util.concurrent.TimeUnit

/**
 * 클라우드 미디어 RED 메트릭 기록 헬퍼.
 * 라벨은 유한 enum/클래스만 사용한다(id·objectKey 금지).
 */
object CloudMediaMetrics {
    const val UPLOAD_SESSION_TRANSITIONS = "cloud.upload.session.transitions"
    const val UPLOAD_PART_DURATION = "cloud.upload.part.duration"
    const val UPLOAD_PART_BYTES = "cloud.upload.part.bytes"
    const val UPLOAD_SESSION_STUCK = "cloud.upload.session.stuck"
    const val PLAYBACK_REQUESTS = "cloud.playback.requests"
    const val PLAYBACK_BYTES_SENT = "cloud.playback.bytes.sent"
    const val PLAYBACK_TOKEN_OPERATIONS = "cloud.playback.token.operations"
    const val RECONCILE_ORPHANS = "cloud.reconcile.orphans"
    const val STORAGE_OPERATIONS = "cloud.storage.operations"
    const val DISK_TEMP_AVAIL_BYTES = "cloud.disk.temp.avail.bytes"
    const val DISK_TEMP_TOTAL_BYTES = "cloud.disk.temp.total.bytes"

    fun recordSessionTransition(
        meterRegistry: MeterRegistry?,
        from: String,
        to: String,
    ) {
        meterRegistry
            ?.counter(
                UPLOAD_SESSION_TRANSITIONS,
                "from",
                from,
                "to",
                to,
            )?.increment()
    }

    fun recordPartUpload(
        meterRegistry: MeterRegistry?,
        result: String,
        durationNanos: Long,
        bytes: Long,
    ) {
        val registry = meterRegistry ?: return
        Timer
            .builder(UPLOAD_PART_DURATION)
            .tag("result", result)
            .register(registry)
            .record(durationNanos, TimeUnit.NANOSECONDS)
        if (bytes > 0) {
            registry.summary(UPLOAD_PART_BYTES).record(bytes.toDouble())
        }
    }

    fun recordPlaybackRequest(
        meterRegistry: MeterRegistry?,
        statusClass: String,
        range: String,
        endpoint: String,
        bytesSent: Long = 0,
    ) {
        val registry = meterRegistry ?: return
        registry
            .counter(
                PLAYBACK_REQUESTS,
                "status_class",
                statusClass,
                "range",
                range,
                "endpoint",
                endpoint,
            ).increment()
        if (bytesSent > 0) {
            registry
                .counter(
                    PLAYBACK_BYTES_SENT,
                    "endpoint",
                    endpoint,
                ).increment(bytesSent.toDouble())
        }
    }

    fun recordTokenOperation(
        meterRegistry: MeterRegistry?,
        op: String,
        amount: Double = 1.0,
    ) {
        if (amount <= 0) return
        meterRegistry
            ?.counter(
                PLAYBACK_TOKEN_OPERATIONS,
                "op",
                op,
            )?.increment(amount)
    }

    fun recordStorageOperation(
        meterRegistry: MeterRegistry?,
        op: String,
    ) {
        meterRegistry
            ?.counter(
                STORAGE_OPERATIONS,
                "op",
                op,
            )?.increment()
    }

    fun statusClassOf(statusCode: Int): String =
        when (statusCode) {
            in 200..299 -> "2xx"
            in 400..499 -> "4xx"
            in 500..599 -> "5xx"
            else -> "other"
        }
}
