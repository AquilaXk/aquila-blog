package com.back.global.security.config

import jakarta.servlet.http.HttpServletResponse
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse

@DisplayName("ApiRuntimeBoundaryFilter 테스트")
class ApiRuntimeBoundaryFilterTest {
    @Test
    @DisplayName("read 모드에서 댓글 조회 GET 경로는 차단하지 않는다")
    fun `read mode allows comments get endpoint`() {
        val filter = ApiRuntimeBoundaryFilter("read", createApiCorsPolicy())
        val request = MockHttpServletRequest("GET", "/post/api/v1/posts/466/comments")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_OK)
    }

    @Test
    @DisplayName("런타임 경계 503 응답에도 CORS 헤더를 포함한다")
    fun `blocked runtime boundary response includes cors headers`() {
        val filter = ApiRuntimeBoundaryFilter("read", createApiCorsPolicy())
        val request = MockHttpServletRequest("POST", "/post/api/v1/posts/466/comments")
        request.addHeader("Origin", "https://www.aquilaxk.site")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_SERVICE_UNAVAILABLE)
        assertThat(response.getHeader("Access-Control-Allow-Origin")).isEqualTo("https://www.aquilaxk.site")
        assertThat(response.getHeader("Access-Control-Allow-Credentials")).isEqualTo("true")
        assertThat(response.getHeader("Retry-After")).isEqualTo("1")
        assertThat(response.contentAsString).contains("503-1")
    }

    @Test
    @DisplayName("admin 모드에서도 댓글 경로 OPTIONS preflight는 차단하지 않는다")
    fun `admin mode allows comments options preflight`() {
        val filter = ApiRuntimeBoundaryFilter("admin", createApiCorsPolicy())
        val request = MockHttpServletRequest("OPTIONS", "/post/api/v1/posts/466/comments")
        request.addHeader("Origin", "https://www.aquilaxk.site")
        request.addHeader("Access-Control-Request-Method", "POST")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_OK)
    }

    private fun createApiCorsPolicy(): ApiCorsPolicy =
        ApiCorsPolicy(
            environment = MockEnvironment().withProperty("spring.profiles.active", "prod"),
            siteFrontUrl = "https://www.aquilaxk.site",
            siteBackUrl = "https://api.aquilaxk.site",
            siteCookieDomain = "aquilaxk.site",
        )
}
