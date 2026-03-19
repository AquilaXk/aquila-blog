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
            val method = sanitizeLogValue(request.method, MAX_METHOD_LENGTH)
            val path = sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH)
            val query = normalizeQueryString(request.queryString)
            val status = response.status
            val remoteIp = resolveClientIp(request)

            if (status >= 500) {
                log.error(
                    "api_error requestId={} method={} path={} query={} status={} latencyMs={} remoteIp={}",
                    requestId,
                    method,
                    path,
                    query,
                    status,
                    elapsedMs,
                    remoteIp,
                )
            } else if (elapsedMs >= slowRequestThresholdMs) {
                log.warn(
                    "slow_request requestId={} method={} path={} query={} status={} latencyMs={} remoteIp={}",
                    requestId,
                    method,
                    path,
                    query,
                    status,
                    elapsedMs,
                    remoteIp,
                )
            }

            MDC.remove(MDC_KEY_REQUEST_ID)
        }
    }

    private fun resolveRequestId(rawHeader: String?): String {
        val candidate = sanitizeLogValue(rawHeader, MAX_REQUEST_ID_LENGTH)
        val normalized =
            candidate.filter { ch ->
                ch.isLetterOrDigit() || ch == '-' || ch == '_' || ch == '.'
            }
        if (normalized.isBlank() || normalized == "-") return UUID.randomUUID().toString()
        return normalized.take(MAX_REQUEST_ID_LENGTH)
    }

    private fun resolveClientIp(request: HttpServletRequest): String {
        val forwardedFor = request.getHeader("X-Forwarded-For")
        return if (!forwardedFor.isNullOrBlank()) {
            sanitizeLogValue(
                forwardedFor
                    .split(",")
                    .firstOrNull(),
                MAX_REMOTE_IP_LENGTH,
            )
        } else {
            sanitizeLogValue(request.remoteAddr, MAX_REMOTE_IP_LENGTH)
        }
    }

    private fun normalizeQueryString(rawQuery: String?): String {
        return sanitizeLogValue(rawQuery, MAX_QUERY_LENGTH)
    }

    private fun sanitizeLogValue(
        raw: String?,
        maxLength: Int,
    ): String {
        if (raw.isNullOrBlank()) return "-"

        val sanitized =
            raw
                .replace('\r', ' ')
                .replace('\n', ' ')
                .replace('\t', ' ')
                .replace(LOG_CONTROL_CHAR_REGEX, "?")
                .trim()

        if (sanitized.isBlank()) return "-"
        return sanitized.take(maxLength)
    }

    companion object {
        private const val REQUEST_ID_HEADER = "X-Request-Id"
        private const val REQUEST_ID_ATTRIBUTE = "requestId"
        private const val MDC_KEY_REQUEST_ID = "requestId"
        private const val MAX_REQUEST_ID_LENGTH = 120
        private const val MAX_METHOD_LENGTH = 16
        private const val MAX_PATH_LENGTH = 512
        private const val MAX_QUERY_LENGTH = 512
        private const val MAX_REMOTE_IP_LENGTH = 120
        private val LOG_CONTROL_CHAR_REGEX = Regex("[\\x00-\\x1F\\x7F]")
    }
}
