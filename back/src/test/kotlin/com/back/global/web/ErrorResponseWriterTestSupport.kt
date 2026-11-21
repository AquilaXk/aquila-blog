package com.back.global.web

import com.back.global.observability.ErrorMetrics
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import tools.jackson.databind.ObjectMapper

object ErrorResponseWriterTestSupport {
    fun createWriter(meterRegistry: MeterRegistry = SimpleMeterRegistry()): ErrorResponseWriter =
        ErrorResponseWriter(
            objectMapper = ObjectMapper(),
            errorMetrics = ErrorMetrics(meterRegistry),
        )
}
