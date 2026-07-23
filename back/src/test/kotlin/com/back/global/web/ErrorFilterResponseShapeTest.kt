package com.back.global.web

import com.back.global.cache.application.port.output.RedisKeyValuePort
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.security.config.ApiCorsPolicy
import com.back.global.security.config.ApiMutationCsrfGuardFilter
import com.back.global.security.config.ApiRateLimitBackstopFilter
import com.back.global.security.config.AuthCookieNames
import com.back.global.security.config.TestPublicApiRequestMatchers
import com.back.global.web.application.ClientIpResolver
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import jakarta.servlet.http.Cookie
import jakarta.servlet.http.HttpServlet
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.NoSuchBeanDefinitionException
import org.springframework.beans.factory.ObjectProvider
import org.springframework.http.HttpHeaders
import org.springframework.mock.env.MockEnvironment
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap

/**
 * Filter/Security 에러 응답이 ErrorResponseWriter를 통해 RsData 형태로 통일되는지 검증한다.
 */
@DisplayName("Filter/Security 에러 응답 shape 통합 테스트")
class ErrorFilterResponseShapeTest {
    @Test
    @DisplayName("401/403 CSRF/429/503 응답이 RsData이고 bucket 필드가 없다")
    fun `error responses share rsdata shape without bucket`() {
        val writer = ErrorResponseWriterTestSupport.createWriter()

        assertRsDataShape(
            writeSecurity(writer, ErrorCode.UNAUTHORIZED),
            expectedStatus = 401,
            expectedCode = "401-1",
        )
        assertRsDataShape(
            writeSecurity(writer, ErrorCode.ACCESS_DENIED),
            expectedStatus = 403,
            expectedCode = "403-1",
        )
        assertRsDataShape(
            writeCsrf(ErrorCode.CSRF_PREFLIGHT_REQUIRED),
            expectedStatus = 403,
            expectedCode = "403-3",
        )
        assertRsDataShape(
            writeCsrf(ErrorCode.CSRF_ORIGIN_DENIED, origin = "https://evil.example"),
            expectedStatus = 403,
            expectedCode = "403-2",
        )
        assertRsDataShape(
            writeRateLimited(),
            expectedStatus = 429,
            expectedCode = "429-10",
            expectedRetryAfter = "60",
        )
        assertRsDataShape(
            writeUnavailable(),
            expectedStatus = 503,
            expectedCode = "503-4",
            expectedRetryAfter = "5",
        )
        assertRsDataShape(
            writeAppException(writer, AppException(ErrorCode.UNAUTHORIZED, "로그인 후 이용해주세요.")),
            expectedStatus = 401,
            expectedCode = "401-1",
        )
    }

    private fun writeSecurity(
        writer: ErrorResponseWriter,
        errorCode: ErrorCode,
    ): MockHttpServletResponse {
        val request = MockHttpServletRequest("GET", "/member/api/v1/members/me")
        val response = MockHttpServletResponse()
        writer.write(request, response, errorCode, ErrorResponseSource.SECURITY)
        return response
    }

    private fun writeAppException(
        writer: ErrorResponseWriter,
        exception: AppException,
    ): MockHttpServletResponse {
        val request = MockHttpServletRequest("GET", "/post/api/v1/posts/1")
        val response = MockHttpServletResponse()
        writer.write(
            request = request,
            response = response,
            errorCode = exception.errorCode,
            source = ErrorResponseSource.FILTER,
            rsData = exception.rsData,
            cause = exception,
        )
        return response
    }

    private fun writeCsrf(
        errorCode: ErrorCode,
        origin: String = "https://www.aquilaxk.site",
    ): MockHttpServletResponse {
        val filter =
            ApiMutationCsrfGuardFilter(
                apiCorsPolicy =
                    ApiCorsPolicy(
                        environment = MockEnvironment().withProperty("spring.profiles.active", "dev"),
                        siteFrontUrl = "https://www.aquilaxk.site",
                        siteBackUrl = "https://api.aquilaxk.site",
                        siteCookieDomain = "aquilaxk.site",
                    ),
                errorResponseWriter = ErrorResponseWriterTestSupport.createWriter(),
            )
        val request = MockHttpServletRequest("POST", "/post/api/v1/posts/1/comments")
        request.setCookies(Cookie(AuthCookieNames.API_KEY, "api-key"))
        request.addHeader(HttpHeaders.ORIGIN, origin)
        if (errorCode == ErrorCode.CSRF_ORIGIN_DENIED) {
            request.addHeader(ApiMutationCsrfGuardFilter.CSRF_PREFLIGHT_HEADER, "1")
        }
        val response = MockHttpServletResponse()
        filter.doFilter(request, response, MockFilterChain())
        return response
    }

    private fun writeRateLimited(): MockHttpServletResponse {
        val redis = InMemoryRedisKeyValuePort()
        val filter = createRateLimitFilter(redis = redis, publicReadLimitPerMinute = 1)
        runFilter(filter, "GET", "/post/api/v1/posts/feed")
        return runFilter(filter, "GET", "/post/api/v1/posts/feed")
    }

    private fun writeUnavailable(): MockHttpServletResponse {
        val filter =
            createRateLimitFilter(
                redis = null,
                requireRedisInProd = true,
                prodRuntime = true,
            )
        return runFilter(filter, "GET", "/post/api/v1/posts/feed")
    }

    private fun assertRsDataShape(
        response: MockHttpServletResponse,
        expectedStatus: Int,
        expectedCode: String,
        expectedRetryAfter: String? = null,
    ) {
        assertThat(response.status).isEqualTo(expectedStatus)
        assertThat(response.contentType).isEqualTo(ErrorResponseWriter.CONTENT_TYPE)
        assertThat(response.contentAsString)
            .contains("\"resultCode\":\"$expectedCode\"")
            .contains("\"msg\":")
            .doesNotContain("\"bucket\"")
        if (expectedRetryAfter != null) {
            assertThat(response.getHeader(HttpHeaders.RETRY_AFTER)).isEqualTo(expectedRetryAfter)
        }
    }

    private fun createRateLimitFilter(
        redis: RedisKeyValuePort?,
        publicReadLimitPerMinute: Int = 120,
        requireRedisInProd: Boolean = false,
        prodRuntime: Boolean = false,
    ) = ApiRateLimitBackstopFilter(
        redisKeyValuePortProvider = objectProvider(redis, RedisKeyValuePort::class.java),
        clientIpResolverProvider = objectProvider(ClientIpResolver(), ClientIpResolver::class.java),
        meterRegistryProvider = objectProvider(SimpleMeterRegistry(), MeterRegistry::class.java),
        errorResponseWriter = ErrorResponseWriterTestSupport.createWriter(),
        environment =
            MockEnvironment().apply {
                setActiveProfiles(if (prodRuntime) "prod" else "test")
            },
        publicApiRequestMatcher = TestPublicApiRequestMatchers.defaultMatcher(),
        publicReadLimitPerMinute = publicReadLimitPerMinute,
        requireRedisInProd = requireRedisInProd,
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
    ): MockHttpServletResponse {
        val request = MockHttpServletRequest(method, path)
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

    private class InMemoryRedisKeyValuePort : RedisKeyValuePort {
        private val values = ConcurrentHashMap<String, String>()

        override fun isAvailable(): Boolean = true

        override fun get(key: String): String? = values[key]

        override fun set(
            key: String,
            value: String,
            ttl: Duration?,
        ) {
            values[key] = value
        }

        override fun increment(key: String): Long? =
            values.compute(key) { _, current -> ((current?.toLongOrNull() ?: 0L) + 1L).toString() }?.toLong()

        override fun expire(
            key: String,
            ttl: Duration,
        ): Boolean = values.containsKey(key)

        override fun delete(keys: Collection<String>): Long = keys.count { values.remove(it) != null }.toLong()

        override fun keys(pattern: String): Set<String> = values.keys.filter { it.startsWith(pattern.removeSuffix("*")) }.toSet()
    }
}
