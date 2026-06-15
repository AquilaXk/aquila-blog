package com.back.global.security.config

import com.back.global.cache.application.port.output.RedisKeyValuePort
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
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
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
    private val environment: Environment,
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
                writeUnavailable(response)
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
                writeUnavailable(response)
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
                    writeUnavailable(response)
                    record(bucket.name, "redis-unavailable")
                    return
                }
                redisKeyValuePort.delete(listOf(key))
                filterChain.doFilter(request, response)
                return
            }
        }

        if (count > bucket.limit.toLong()) {
            writeTooManyRequests(response, bucket.name)
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
        if (method in SAFE_METHODS && isPublicReadPath(path)) {
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

    private fun isPublicReadPath(path: String): Boolean = PUBLIC_READ_PATHS.any { it.matches(path) } || PUBLIC_DETAIL_PATH.matches(path)

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
        response: HttpServletResponse,
        bucket: String,
    ) {
        response.status = 429
        response.setHeader(HttpHeaders.RETRY_AFTER, WINDOW.seconds.toString())
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.characterEncoding = Charsets.UTF_8.name()
        response.writer.write("""{"resultCode":"429-10","msg":"요청이 너무 많습니다.","bucket":"$bucket"}""")
    }

    private fun writeUnavailable(response: HttpServletResponse) {
        response.status = HttpServletResponse.SC_SERVICE_UNAVAILABLE
        response.setHeader(HttpHeaders.RETRY_AFTER, "5")
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.characterEncoding = Charsets.UTF_8.name()
        response.writer.write("""{"resultCode":"503-4","msg":"API 보호 시스템이 준비되지 않았습니다."}""")
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
        private val PUBLIC_READ_PATHS =
            listOf(
                Regex("^/post/api/v\\d+/posts$"),
                Regex("^/post/api/v\\d+/posts/feed$"),
                Regex("^/post/api/v\\d+/posts/feed/cursor$"),
                Regex("^/post/api/v\\d+/posts/bootstrap$"),
                Regex("^/post/api/v\\d+/posts/explore$"),
                Regex("^/post/api/v\\d+/posts/explore/cursor$"),
                Regex("^/post/api/v\\d+/posts/search$"),
                Regex("^/post/api/v\\d+/posts/tags$"),
                Regex("^/post/api/v\\d+/posts/related/author$"),
                Regex("^/post/api/v\\d+/posts/\\d+/comments$"),
                Regex("^/post/api/v\\d+/posts/\\d+/comments/\\d+$"),
                Regex("^/post/api/v\\d+/images/.*"),
            )
        private val PUBLIC_DETAIL_PATH = Regex("^/post/api/v\\d+/posts/\\d+$")
        private val AUTHENTICATED_READ_PATHS =
            listOf(
                Regex("^/member/api/v\\d+/notifications$"),
                Regex("^/member/api/v\\d+/notifications/snapshot$"),
                Regex("^/member/api/v\\d+/notifications/unread-count$"),
            )
    }
}
