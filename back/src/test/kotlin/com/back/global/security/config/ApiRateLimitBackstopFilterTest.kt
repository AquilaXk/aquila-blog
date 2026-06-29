package com.back.global.security.config

import com.back.global.cache.application.port.output.RedisKeyValuePort
import com.back.global.web.application.ClientIpResolver
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import jakarta.servlet.http.HttpServlet
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.NoSuchBeanDefinitionException
import org.springframework.beans.factory.ObjectProvider
import org.springframework.mock.env.MockEnvironment
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap

@DisplayName("ApiRateLimitBackstopFilter 테스트")
class ApiRateLimitBackstopFilterTest {
    @Test
    @DisplayName("기본 설정은 public read 기본 한도를 적용한다")
    fun `default configuration applies public read limit`() {
        val redis = InMemoryRedisKeyValuePort()
        val filter =
            ApiRateLimitBackstopFilter(
                redisKeyValuePortProvider = objectProvider(redis, RedisKeyValuePort::class.java),
                clientIpResolverProvider = objectProvider(ClientIpResolver(), ClientIpResolver::class.java),
                meterRegistryProvider = objectProvider(SimpleMeterRegistry(), MeterRegistry::class.java),
                environment = MockEnvironment().apply { setActiveProfiles("test") },
            )

        repeat(120) {
            assertThat(runFilter(filter, "GET", "/post/api/v1/posts/feed").status).isEqualTo(HttpServletResponse.SC_OK)
        }

        assertThat(runFilter(filter, "GET", "/post/api/v1/posts/feed").status).isEqualTo(429)
    }

    @Test
    @DisplayName("public read API가 분당 제한을 넘으면 429와 Retry-After를 반환한다")
    fun `public read api is rate limited by client ip`() {
        val redis = InMemoryRedisKeyValuePort()
        val meterRegistry = SimpleMeterRegistry()
        val filter = createFilter(redis = redis, meterRegistry = meterRegistry, publicReadLimitPerMinute = 2)

        assertThat(runFilter(filter, "GET", "/post/api/v1/posts/feed").status).isEqualTo(HttpServletResponse.SC_OK)
        assertThat(runFilter(filter, "GET", "/post/api/v1/posts/feed").status).isEqualTo(HttpServletResponse.SC_OK)

        val limited = runFilter(filter, "GET", "/post/api/v1/posts/feed")

        assertThat(limited.status).isEqualTo(429)
        assertThat(limited.getHeader("Retry-After")).isEqualTo("60")
        assertThat(limited.contentAsString).contains("\"resultCode\":\"429-10\"")
        assertThat(redis.expiredKeys()).anyMatch { it.contains("public-read") && it.contains("203.0.113.10") }
        assertThat(
            meterRegistry
                .find("api_rate_limit_rejected_total")
                .tag("bucket", "public-read")
                .counter()
                ?.count(),
        ).isEqualTo(1.0)
    }

    @Test
    @DisplayName("외부 cloud content GET HEAD는 public read bucket으로 제한한다")
    fun `external cloud content get and head use public read bucket`() {
        val redis = InMemoryRedisKeyValuePort()
        val filter = createFilter(redis = redis, publicReadLimitPerMinute = 2)
        val path = "/system/api/v1/adm/cloud/files/12/external-content"

        assertThat(runFilter(filter, "GET", path).status).isEqualTo(HttpServletResponse.SC_OK)
        assertThat(runFilter(filter, "HEAD", path).status).isEqualTo(HttpServletResponse.SC_OK)

        val limited = runFilter(filter, "GET", path)

        assertThat(limited.status).isEqualTo(429)
        assertThat(limited.contentAsString).contains("public-read")
        assertThat(redis.expiredKeys()).anyMatch { it.contains("public-read") }
    }

    @Test
    @DisplayName("게시글 첨부파일 GET HEAD는 public read bucket으로 제한한다")
    fun `post file get and head use public read bucket`() {
        val redis = InMemoryRedisKeyValuePort()
        val filter = createFilter(redis = redis, publicReadLimitPerMinute = 2)
        val path = "/post/api/v1/files/posts/2026/03/manual.pdf"

        assertThat(runFilter(filter, "GET", path).status).isEqualTo(HttpServletResponse.SC_OK)
        assertThat(runFilter(filter, "HEAD", path).status).isEqualTo(HttpServletResponse.SC_OK)

        val limited = runFilter(filter, "GET", path)

        assertThat(limited.status).isEqualTo(429)
        assertThat(limited.contentAsString).contains("public-read")
        assertThat(redis.expiredKeys()).anyMatch { it.contains("public-read") }
    }

    @Test
    @DisplayName("비활성화, actuator, OPTIONS 요청은 rate limit을 건너뛴다")
    fun `disabled actuator and options requests bypass filter`() {
        val disabled = createFilter(redis = InMemoryRedisKeyValuePort(), enabled = false, publicReadLimitPerMinute = 1)
        val enabled = createFilter(redis = InMemoryRedisKeyValuePort(), publicReadLimitPerMinute = 1)

        assertThat(runFilter(disabled, "GET", "/post/api/v1/posts/feed").status).isEqualTo(HttpServletResponse.SC_OK)
        assertThat(runFilter(enabled, "GET", "/actuator/health/readiness").status).isEqualTo(HttpServletResponse.SC_OK)
        assertThat(runFilter(enabled, "OPTIONS", "/post/api/v1/posts/feed").status).isEqualTo(HttpServletResponse.SC_OK)
    }

    @Test
    @DisplayName("rate limit 한도값은 0 이하로 설정할 수 없다")
    fun `rate limit thresholds must be positive`() {
        assertThatThrownBy {
            createFilter(redis = InMemoryRedisKeyValuePort(), publicReadLimitPerMinute = 0)
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("publicReadLimitPerMinute must be > 0")
    }

    @Test
    @DisplayName("SSE 신규 연결은 public read와 별도 bucket으로 제한한다")
    fun `sse stream open is rate limited separately`() {
        val filter = createFilter(redis = InMemoryRedisKeyValuePort(), sseLimitPerMinute = 1)

        assertThat(runFilter(filter, "GET", "/member/api/v1/notifications/stream").status).isEqualTo(HttpServletResponse.SC_OK)

        val limited = runFilter(filter, "GET", "/member/api/v1/notifications/stream")

        assertThat(limited.status).isEqualTo(429)
        assertThat(limited.contentAsString).contains("sse-open")
    }

    @Test
    @DisplayName("알림 polling GET은 authenticated-read bucket으로 제한한다")
    fun `notification polling get endpoints use authenticated read bucket`() {
        val filter = createFilter(redis = InMemoryRedisKeyValuePort(), authenticatedReadLimitPerMinute = 2)

        assertThat(runFilter(filter, "GET", "/member/api/v1/notifications/snapshot").status)
            .isEqualTo(HttpServletResponse.SC_OK)
        assertThat(runFilter(filter, "GET", "/member/api/v1/notifications/unread-count").status)
            .isEqualTo(HttpServletResponse.SC_OK)

        val limited = runFilter(filter, "GET", "/member/api/v1/notifications")

        assertThat(limited.status).isEqualTo(429)
        assertThat(limited.contentAsString).contains("authenticated-read")
    }

    @Test
    @DisplayName("OAuth와 signup/auth 요청은 auth bucket으로 제한한다")
    fun `oauth and signup auth paths use auth bucket`() {
        val filter = createFilter(redis = InMemoryRedisKeyValuePort(), authLimitPerMinute = 1)

        assertThat(runFilter(filter, "GET", "/login/oauth2/code/github").status).isEqualTo(HttpServletResponse.SC_OK)

        val limited = runFilter(filter, "POST", "/member/api/v1/signup/email/start")

        assertThat(limited.status).isEqualTo(429)
        assertThat(limited.contentAsString).contains("auth")
    }

    @Test
    @DisplayName("mutating API는 mutation bucket으로 제한한다")
    fun `mutating api uses mutation bucket`() {
        val filter = createFilter(redis = InMemoryRedisKeyValuePort(), mutationLimitPerMinute = 1)

        assertThat(runFilter(filter, "POST", "/post/api/v1/posts/1/hit").status).isEqualTo(HttpServletResponse.SC_OK)

        val limited = runFilter(filter, "DELETE", "/post/api/v1/posts/1")

        assertThat(limited.status).isEqualTo(429)
        assertThat(limited.contentAsString).contains("mutation")
    }

    @Test
    @DisplayName("context path가 있으면 제거한 API path로 bucket을 계산한다")
    fun `context path is removed before bucket matching`() {
        val filter = createFilter(redis = InMemoryRedisKeyValuePort(), publicReadLimitPerMinute = 1)

        assertThat(
            runFilter(
                filter,
                "GET",
                "/ctx/post/api/v1/posts/feed",
                contextPath = "/ctx",
            ).status,
        ).isEqualTo(HttpServletResponse.SC_OK)

        val limited = runFilter(filter, "GET", "/ctx/post/api/v1/posts/feed", contextPath = "/ctx")

        assertThat(limited.status).isEqualTo(429)
    }

    @Test
    @DisplayName("Redis가 unavailable이면 non-prod에서는 fail-open으로 통과한다")
    fun `non prod with unavailable redis fails open`() {
        val filter =
            createFilter(
                redis = InMemoryRedisKeyValuePort(available = false),
                requireRedisInProd = false,
                publicReadLimitPerMinute = 1,
            )

        assertThat(runFilter(filter, "GET", "/post/api/v1/posts/feed").status).isEqualTo(HttpServletResponse.SC_OK)
        assertThat(runFilter(filter, "GET", "/post/api/v1/posts/feed").status).isEqualTo(HttpServletResponse.SC_OK)
    }

    @Test
    @DisplayName("Redis increment가 null이면 non-prod에서는 fail-open으로 통과한다")
    fun `non prod with null redis increment fails open`() {
        val filter =
            createFilter(
                redis = InMemoryRedisKeyValuePort(incrementAvailable = false),
                requireRedisInProd = false,
                publicReadLimitPerMinute = 1,
            )

        assertThat(runFilter(filter, "GET", "/post/api/v1/posts/feed").status).isEqualTo(HttpServletResponse.SC_OK)
        assertThat(runFilter(filter, "GET", "/post/api/v1/posts/feed").status).isEqualTo(HttpServletResponse.SC_OK)
    }

    @Test
    @DisplayName("Redis TTL 설정 실패는 non-prod에서 fail-open하고 카운터를 제거한다")
    fun `non prod with redis ttl failure fails open and deletes counter`() {
        val redis = InMemoryRedisKeyValuePort(expireAvailable = false)
        val filter =
            createFilter(
                redis = redis,
                requireRedisInProd = false,
                publicReadLimitPerMinute = 1,
            )

        assertThat(runFilter(filter, "GET", "/post/api/v1/posts/feed").status).isEqualTo(HttpServletResponse.SC_OK)
        assertThat(redis.keys("security:api-rate-limit:")).isEmpty()
    }

    @Test
    @DisplayName("Redis bean이 없으면 non-prod에서는 fail-open으로 통과한다")
    fun `non prod without redis bean fails open`() {
        val filter =
            createFilter(
                redis = null,
                requireRedisInProd = false,
                publicReadLimitPerMinute = 1,
            )

        assertThat(runFilter(filter, "GET", "/post/api/v1/posts/feed").status).isEqualTo(HttpServletResponse.SC_OK)
        assertThat(runFilter(filter, "GET", "/post/api/v1/posts/feed").status).isEqualTo(HttpServletResponse.SC_OK)
    }

    @Test
    @DisplayName("prod에서 Redis bean이 없고 필수이면 fail-closed로 503을 반환한다")
    fun `prod without redis bean fails closed`() {
        val filter =
            createFilter(
                redis = null,
                requireRedisInProd = true,
                prodRuntime = true,
            )

        val response = runFilter(filter, "GET", "/post/api/v1/posts/feed")

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_SERVICE_UNAVAILABLE)
        assertThat(response.contentAsString).contains("\"resultCode\":\"503-4\"")
    }

    @Test
    @DisplayName("Redis increment가 null이고 prod이면 fail-closed로 503을 반환한다")
    fun `prod with null redis increment fails closed`() {
        val filter =
            createFilter(
                redis = InMemoryRedisKeyValuePort(incrementAvailable = false),
                requireRedisInProd = true,
                prodRuntime = true,
            )

        val response = runFilter(filter, "GET", "/post/api/v1/posts/feed")

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_SERVICE_UNAVAILABLE)
        assertThat(response.contentAsString).contains("\"resultCode\":\"503-4\"")
    }

    @Test
    @DisplayName("Redis TTL 설정 실패는 prod에서 fail-closed로 503을 반환한다")
    fun `prod with redis ttl failure fails closed`() {
        val filter =
            createFilter(
                redis = InMemoryRedisKeyValuePort(expireAvailable = false),
                requireRedisInProd = true,
                prodRuntime = true,
            )

        val response = runFilter(filter, "GET", "/post/api/v1/posts/feed")

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_SERVICE_UNAVAILABLE)
        assertThat(response.contentAsString).contains("\"resultCode\":\"503-4\"")
    }

    @Test
    @DisplayName("Redis가 필수인데 없으면 fail-closed로 503을 반환한다")
    fun `required redis unavailable fails closed`() {
        val filter =
            createFilter(
                redis = InMemoryRedisKeyValuePort(available = false),
                requireRedisInProd = true,
                prodRuntime = true,
            )

        val response = runFilter(filter, "POST", "/post/api/v1/posts/1/hit")

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_SERVICE_UNAVAILABLE)
        assertThat(response.contentAsString).contains("\"resultCode\":\"503-4\"")
    }

    @Test
    @DisplayName("clientIpResolver와 meterRegistry provider가 비어도 요청은 처리된다")
    fun `empty optional providers fall back without metrics`() {
        val redis = InMemoryRedisKeyValuePort()
        val filter =
            createFilter(
                redis = redis,
                clientIpResolver = null,
                meterRegistry = null,
                publicReadLimitPerMinute = 1,
            )

        assertThat(runFilter(filter, "GET", "/post/api/v1/posts/feed").status).isEqualTo(HttpServletResponse.SC_OK)

        val limited = runFilter(filter, "GET", "/post/api/v1/posts/feed")

        assertThat(limited.status).isEqualTo(429)
        assertThat(redis.expiredKeys()).anyMatch { it.contains("public-read") }
    }

    private fun createFilter(
        redis: RedisKeyValuePort?,
        clientIpResolver: ClientIpResolver? = ClientIpResolver(),
        meterRegistry: SimpleMeterRegistry? = SimpleMeterRegistry(),
        enabled: Boolean = true,
        requireRedisInProd: Boolean = false,
        publicReadLimitPerMinute: Int = 120,
        authenticatedReadLimitPerMinute: Int = 120,
        mutationLimitPerMinute: Int = 60,
        authLimitPerMinute: Int = 20,
        sseLimitPerMinute: Int = 30,
        prodRuntime: Boolean = false,
    ) = ApiRateLimitBackstopFilter(
        redisKeyValuePortProvider = objectProvider(redis, RedisKeyValuePort::class.java),
        clientIpResolverProvider = objectProvider(clientIpResolver, ClientIpResolver::class.java),
        meterRegistryProvider = objectProvider(meterRegistry, MeterRegistry::class.java),
        environment =
            MockEnvironment().apply {
                setActiveProfiles(if (prodRuntime) "prod" else "test")
            },
        enabled = enabled,
        requireRedisInProd = requireRedisInProd,
        publicReadLimitPerMinute = publicReadLimitPerMinute,
        authenticatedReadLimitPerMinute = authenticatedReadLimitPerMinute,
        mutationLimitPerMinute = mutationLimitPerMinute,
        authLimitPerMinute = authLimitPerMinute,
        sseLimitPerMinute = sseLimitPerMinute,
    )

    private fun <T : Any> objectProvider(
        value: T?,
        type: Class<T>,
    ): ObjectProvider<T> =
        object : ObjectProvider<T> {
            override fun getObject(): T = value ?: throw NoSuchBeanDefinitionException(type)

            override fun getIfAvailable(): T? = value
        }

    private fun runFilter(
        filter: ApiRateLimitBackstopFilter,
        method: String,
        path: String,
        contextPath: String = "",
    ): MockHttpServletResponse {
        val request = MockHttpServletRequest(method, path)
        request.contextPath = contextPath
        request.remoteAddr = "172.19.0.2"
        request.addHeader("CF-Connecting-IP", "203.0.113.10")
        val response = MockHttpServletResponse()
        val chain =
            MockFilterChain(
                object : HttpServlet() {
                    override fun service(
                        req: HttpServletRequest,
                        res: HttpServletResponse,
                    ) {
                        res.status = HttpServletResponse.SC_OK
                    }
                },
            )

        filter.doFilter(request, response, chain)
        return response
    }

    private class InMemoryRedisKeyValuePort(
        private val available: Boolean = true,
        private val incrementAvailable: Boolean = true,
        private val expireAvailable: Boolean = true,
    ) : RedisKeyValuePort {
        private val values = ConcurrentHashMap<String, String>()
        private val expirations = ConcurrentHashMap.newKeySet<String>()

        override fun isAvailable(): Boolean = available

        override fun get(key: String): String? = values[key]

        override fun set(
            key: String,
            value: String,
            ttl: Duration?,
        ) {
            values[key] = value
            if (ttl != null) expirations += key
        }

        override fun increment(key: String): Long? {
            if (!available || !incrementAvailable) return null
            return values.compute(key) { _, current -> ((current?.toLongOrNull() ?: 0L) + 1L).toString() }?.toLong()
        }

        override fun expire(
            key: String,
            ttl: Duration,
        ): Boolean {
            if (!available || !expireAvailable) return false
            expirations += key
            return true
        }

        override fun delete(keys: Collection<String>): Long {
            val removed = keys.count { values.remove(it) != null }
            expirations.removeAll(keys.toSet())
            return removed.toLong()
        }

        override fun keys(pattern: String): Set<String> = values.keys.filter { it.startsWith(pattern.removeSuffix("*")) }.toSet()

        fun expiredKeys(): Set<String> = expirations.toSet()
    }
}
