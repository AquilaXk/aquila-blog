package com.back.global.observability

import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Component

/**
 * resultCode 단위 에러 카운터.
 * Prometheus 노출명: `app_exception_total`
 * 태그: code / status / source — path 태그는 cardinality 때문에 넣지 않는다.
 */
@Component
class ErrorMetrics(
    private val meterRegistry: MeterRegistry,
) {
    fun increment(
        code: String,
        status: Int,
        source: String,
    ) {
        meterRegistry
            .counter(
                METRIC_NAME,
                "code",
                code,
                "status",
                status.toString(),
                "source",
                source,
            ).increment()
    }

    companion object {
        const val METRIC_NAME = "app.exception"
        const val SOURCE_HANDLER = "handler"
        const val SOURCE_FILTER = "filter"
        const val SOURCE_SECURITY = "security"
    }
}
