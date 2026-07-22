package com.back.global.security.config

import com.back.global.cache.application.port.output.RedisKeyValuePort
import com.back.global.exception.application.ErrorCode
import com.back.global.web.ErrorResponseSource
import com.back.global.web.ErrorResponseWriter
import com.back.global.web.application.ClientIpResolver
import io.micrometer.core.instrument.MeterRegistry
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.core.env.Environment
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.time.Duration
import java.time.Instant

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
class ApiRateLimitBackstopFilter(
    private val redisKeyValuePortProvider: ObjectProvider<RedisKeyValuePort>,
    private val clientIpResolverProvider: ObjectProvider<ClientIpResolver>,
    private val meterRegistryProvider: ObjectProvider<MeterRegistry>,
    private val errorResponseWriter: ErrorResponseWriter,
    private val environment: Environment,
    private val publicApiRequestMatcher: PublicApiRequestMatcher,
    @param:Value("\${custom.security.apiRateLimit.enabled:true}")
    private val enabled: Boolean = true,
    @param:Value("\${custom.security.apiRateLimit.requireRedisInProd:true}")
    private val requireRedisInProd: Boolean = true,
    @param:Value("\${custom.security.apiRateLimit.publicReadLimitPerMinute:120}")
    private val publicReadLimitPerMinute: Int = 120,
    @param:Value("\${custom.security.apiRateLimit.authenticatedReadLimitPerMinute:120}")
    private val authenticatedReadLimitPerMinute: Int = 120,
    @param:Value("\${custom.security.apiRateLimit.mutationLimitPerMinute:60}")
    private val mutationLimitPerMinute: Int = 60,
    @param:Value("\${custom.security.apiRateLimit.authLimitPerMinute:20}")
    private val authLimitPerMinute: Int = 20,
    @param:Value("\${custom.security.apiRateLimit.sseLimitPerMinute:30}")
    private val sseLimitPerMinute: Int = 30,
) : OncePerRequestFilter() {
    init {
        require(publicReadLimitPerMinute > 0) { "publicReadLimitPerMinute must be > 0" }
        require(authenticatedReadLimitPerMinute > 0) { "authenticatedReadLimitPerMinute must be > 0" }
        require(mutationLimitPerMinute > 0) { "mutationLimitPerMinute must be > 0" }
        require(authLimitPerMinute > 0) { "authLimitPerMinute must be > 0" }
        require(sseLimitPerMinute > 0) { "sseLimitPerMinute must be > 0" }
    }

    override fun shouldNotFilter(request: HttpServletRequest): Boolean {
        if (!enabled) return true
        val path = requestPath(request)
        if (path.startsWith("/actuator/")) return true
        return bucketFor(request.method, path) == null
    }

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val path = requestPath(request)
        val bucket = bucketFor(request.method, path) ?: error("ApiRateLimitBackstopFilter invoked without a rate-limit bucket.")

        val redisKeyValuePort = redisKeyValuePortProvider.getIfAvailable()
        if (redisKeyValuePort == null || !redisKeyValuePort.isAvailable()) {
            if (shouldFailClosedWithoutRedis()) {
                writeUnavailable(request, response)
                record(bucket.name, "redis-unavailable")
                return
            }
            filterChain.doFilter(request, response)
            return
        }

        val clientIp = (clientIpResolverProvider.getIfAvailable() ?: ClientIpResolver()).resolve(request).ifBlank { "unknown" }
        val key = redisKey(bucket.name, clientIp)
        val count = redisKeyValuePort.increment(key)
        if (count == null) {
            if (shouldFailClosedWithoutRedis()) {
                writeUnavailable(request, response)
                record(bucket.name, "redis-unavailable")
                return
            }
            filterChain.doFilter(request, response)
            return
        }

        if (count == 1L) {
            val ttlApplied = redisKeyValuePort.expire(key, WINDOW)
            if (!ttlApplied) {
                if (shouldFailClosedWithoutRedis()) {
                    writeUnavailable(request, response)
                    record(bucket.name, "redis-unavailable")
                    return
                }
                redisKeyValuePort.delete(listOf(key))
                filterChain.doFilter(request, response)
                return
            }
        }

        if (count > bucket.limit.toLong()) {
            writeTooManyRequests(request, response)
            record(bucket.name, "rejected")
            meterRegistryProvider.getIfAvailable()?.counter("api_rate_limit_rejected_total", "bucket", bucket.name)?.increment()
            return
        }

        record(bucket.name, "accepted")
        filterChain.doFilter(request, response)
    }

    private fun bucketFor(
        rawMethod: String,
        path: String,
    ): Bucket? {
        val method = rawMethod.uppercase()
        if (method == "OPTIONS") return null
        if (method == "GET" && path == "/member/api/v1/notifications/stream") {
            return Bucket("sse-open", sseLimitPerMinute)
        }
        if (isAuthPath(path)) {
            return Bucket("auth", authLimitPerMinute)
        }
        if (method in SAFE_METHODS && publicApiRequestMatcher.isPublicReadSafe(method, path)) {
            return Bucket("public-read", publicReadLimitPerMinute)
        }
        if (method in SAFE_METHODS && isAuthenticatedReadPath(path)) {
            return Bucket("authenticated-read", authenticatedReadLimitPerMinute)
        }
        if (method !in SAFE_METHODS && API_PATH_REGEX.matches(path)) {
            return Bucket("mutation", mutationLimitPerMinute)
        }
        return null
    }

    private fun isAuthPath(path: String): Boolean =
        AUTH_PATHS.any { it.matches(path) } ||
            path.startsWith("/oauth2/") ||
            path.startsWith("/login/oauth2/")

    private fun isAuthenticatedReadPath(path: String): Boolean = AUTHENTICATED_READ_PATHS.any { it.matches(path) }

    private fun shouldFailClosedWithoutRedis(): Boolean = environment.matchesProfiles("prod") && requireRedisInProd

    private fun requestPath(request: HttpServletRequest): String {
        val contextPath = request.contextPath.orEmpty()
        val uri = request.requestURI.orEmpty()
        return if (contextPath.isNotBlank() && uri.startsWith(contextPath)) {
            uri.removePrefix(contextPath)
        } else {
            uri
        }
    }

    private fun redisKey(
        bucket: String,
        clientIp: String,
    ): String {
        val minuteBucket = Instant.now().epochSecond / WINDOW.seconds
        return "security:api-rate-limit:$bucket:${sanitizeKeyToken(clientIp)}:$minuteBucket"
    }

    private fun sanitizeKeyToken(raw: String): String = raw.replace(Regex("[^A-Za-z0-9:._-]"), "_").take(96)

    private fun writeTooManyRequests(
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        errorResponseWriter.write(
            request = request,
            response = response,
            errorCode = ErrorCode.API_RATE_LIMITED,
            source = ErrorResponseSource.FILTER,
            retryAfterSeconds = WINDOW.seconds,
        )
    }

    private fun writeUnavailable(
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        errorResponseWriter.write(
            request = request,
            response = response,
            errorCode = ErrorCode.API_PROTECTION_NOT_READY,
            source = ErrorResponseSource.FILTER,
            retryAfterSeconds = 5,
        )
    }

    private fun record(
        bucket: String,
        result: String,
    ) {
        meterRegistryProvider.getIfAvailable()?.counter("api_rate_limit_result_total", "bucket", bucket, "result", result)?.increment()
    }

    private data class Bucket(
        val name: String,
        val limit: Int,
    )

    companion object {
        private val WINDOW = Duration.ofMinutes(1)
        private val SAFE_METHODS = setOf("GET", "HEAD")
        private val API_PATH_REGEX = Regex("^/[^/]+/api/.*")
        private val AUTH_PATHS =
            listOf(
                Regex("^/member/api/v\\d+/auth/login$"),
                Regex("^/member/api/v\\d+/signup/email/start$"),
                Regex("^/member/api/v\\d+/signup/email/verify$"),
                Regex("^/member/api/v\\d+/signup/complete$"),
            )
        private val AUTHENTICATED_READ_PATHS =
            listOf(
                Regex("^/member/api/v\\d+/notifications$"),
                Regex("^/member/api/v\\d+/notifications/snapshot$"),
                Regex("^/member/api/v\\d+/notifications/unread-count$"),
            )
    }
}
