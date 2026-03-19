package com.back.global.web.config

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.slf4j.MDC
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.util.UUID

/**
 * RequestCorrelationFilter는 요청 단위 상관키를 부여하고 운영 로그 상관분석을 돕는다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class RequestCorrelationFilter(
    @param:Value("\${custom.observability.request.slowMs:1200}")
    private val slowRequestThresholdMs: Long,
) : OncePerRequestFilter() {
    private val log = LoggerFactory.getLogger(RequestCorrelationFilter::class.java)

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val requestId = resolveRequestId(request.getHeader(REQUEST_ID_HEADER))
        val startNs = System.nanoTime()

        MDC.put(MDC_KEY_REQUEST_ID, requestId)
        request.setAttribute(REQUEST_ID_ATTRIBUTE, requestId)
        response.setHeader(REQUEST_ID_HEADER, requestId)

        try {
            filterChain.doFilter(request, response)
        } finally {
            val elapsedMs = (System.nanoTime() - startNs) / 1_000_000
            val method = request.method
            val path = request.requestURI.orEmpty()
            val status = response.status

            if (status >= 500) {
                log.error(
                    "api_error requestId={} method={} path={} query={} status={} latencyMs={} remoteIp={}",
                    requestId,
                    method,
                    path,
                    normalizeQueryString(request.queryString),
                    status,
                    elapsedMs,
                    resolveClientIp(request),
                )
            } else if (elapsedMs >= slowRequestThresholdMs) {
                log.warn(
                    "slow_request requestId={} method={} path={} query={} status={} latencyMs={} remoteIp={}",
                    requestId,
                    method,
                    path,
                    normalizeQueryString(request.queryString),
                    status,
                    elapsedMs,
                    resolveClientIp(request),
                )
            }

            MDC.remove(MDC_KEY_REQUEST_ID)
        }
    }

    private fun resolveRequestId(rawHeader: String?): String {
        val trimmed = rawHeader?.trim().orEmpty()
        if (trimmed.isBlank()) return UUID.randomUUID().toString()
        return trimmed.take(MAX_REQUEST_ID_LENGTH)
    }

    private fun resolveClientIp(request: HttpServletRequest): String {
        val forwardedFor = request.getHeader("X-Forwarded-For")?.trim().orEmpty()
        return if (forwardedFor.isNotBlank()) {
            forwardedFor
                .split(",")
                .firstOrNull()
                ?.trim()
                .orEmpty()
        } else {
            request.remoteAddr.orEmpty()
        }
    }

    private fun normalizeQueryString(rawQuery: String?): String {
        val normalized = rawQuery?.trim().orEmpty()
        if (normalized.isBlank()) return "-"
        return normalized.take(MAX_QUERY_LENGTH)
    }

    companion object {
        private const val REQUEST_ID_HEADER = "X-Request-Id"
        private const val REQUEST_ID_ATTRIBUTE = "requestId"
        private const val MDC_KEY_REQUEST_ID = "requestId"
        private const val MAX_REQUEST_ID_LENGTH = 120
        private const val MAX_QUERY_LENGTH = 512
    }
}
