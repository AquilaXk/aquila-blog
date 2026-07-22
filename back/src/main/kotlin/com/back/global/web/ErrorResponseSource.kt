package com.back.global.web

import com.back.global.observability.ErrorMetrics

enum class ErrorResponseSource(
    val tag: String,
) {
    FILTER(ErrorMetrics.SOURCE_FILTER),
    SECURITY(ErrorMetrics.SOURCE_SECURITY),
}
