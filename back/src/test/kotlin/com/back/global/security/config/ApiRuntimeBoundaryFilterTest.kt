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
        val filter = createFilter("read")
        val request = MockHttpServletRequest("GET", "/post/api/v1/posts/466/comments")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_OK)
    }

    @Test
    @DisplayName("read 모드에서 related/author와 images GET 경로는 차단하지 않는다")
    fun `read mode allows related author and images get endpoints`() {
        val filter = createFilter("read")

        for (path in listOf(
            "/post/api/v1/posts/related/author",
            "/post/api/v1/images/posts/2026/03/cover.webp",
        )) {
            val request = MockHttpServletRequest("GET", path)
            val response = MockHttpServletResponse()

            filter.doFilter(request, response, MockFilterChain())

            assertThat(response.status).isEqualTo(HttpServletResponse.SC_OK)
        }
    }

    @Test
    @DisplayName("read 모드에서 외부 cloud content GET HEAD 경로는 차단하지 않는다")
    fun `read mode allows external cloud content get and head endpoints`() {
        val filter = createFilter("read")

        for (method in listOf("GET", "HEAD")) {
            val request = MockHttpServletRequest(method, "/system/api/v1/adm/cloud/files/12/external-content")
            val response = MockHttpServletResponse()

            filter.doFilter(request, response, MockFilterChain())

            assertThat(response.status).isEqualTo(HttpServletResponse.SC_OK)
        }
    }

    @Test
    @DisplayName("read 모드에서 게시글 첨부파일 GET HEAD 경로는 차단하지 않는다")
    fun `read mode allows post file get and head endpoints`() {
        val filter = createFilter("read")

        for (method in listOf("GET", "HEAD")) {
            val request = MockHttpServletRequest(method, "/post/api/v1/files/posts/2026/03/manual.pdf")
            val response = MockHttpServletResponse()

            filter.doFilter(request, response, MockFilterChain())

            assertThat(response.status).isEqualTo(HttpServletResponse.SC_OK)
        }
    }

    @Test
    @DisplayName("worker/none 모드는 API를 fail-closed로 차단한다")
    fun `worker and none modes fail closed for api`() {
        for (mode in listOf("worker", "none")) {
            val filter = createFilter(mode)
            val request = MockHttpServletRequest("GET", "/post/api/v1/posts/feed")
            val response = MockHttpServletResponse()

            filter.doFilter(request, response, MockFilterChain())

            assertThat(response.status).isEqualTo(HttpServletResponse.SC_SERVICE_UNAVAILABLE)
            assertThat(response.contentAsString).contains("503-1")
        }
    }

    @Test
    @DisplayName("런타임 경계 503 응답에도 CORS 헤더를 포함한다")
    fun `blocked runtime boundary response includes cors headers`() {
        val filter = createFilter("read")
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
        val filter = createFilter("admin")
        val request = MockHttpServletRequest("OPTIONS", "/post/api/v1/posts/466/comments")
        request.addHeader("Origin", "https://www.aquilaxk.site")
        request.addHeader("Access-Control-Request-Method", "POST")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_OK)
    }

    @Test
    @DisplayName("read 모드에서 actuator와 non-api 경로는 필터를 건너뛴다")
    fun `read mode skips actuator and non api paths`() {
        val filter = createFilter("read")

        for (path in listOf("/actuator/health", "/favicon.ico")) {
            val request = MockHttpServletRequest("GET", path)
            val response = MockHttpServletResponse()

            filter.doFilter(request, response, MockFilterChain())

            assertThat(response.status).isEqualTo(HttpServletResponse.SC_OK)
        }
    }

    @Test
    @DisplayName("context-path가 있어도 runtime boundary path 판정이 동작한다")
    fun `context path is stripped before runtime boundary matching`() {
        val filter = createFilter("read")
        val request = MockHttpServletRequest("GET", "/post/api/v1/posts/feed")
        request.contextPath = "/blog"
        request.requestURI = "/blog/post/api/v1/posts/feed"
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_OK)
    }

    @Test
    @DisplayName("cors policy가 없어도 차단 응답은 503으로 종료된다")
    fun `blocked response works without cors policy`() {
        val filter =
            ApiRuntimeBoundaryFilter(
                "none",
                null,
                TestPublicApiRequestMatchers.defaultMatcher(),
            )
        val request = MockHttpServletRequest("GET", "/post/api/v1/posts/feed")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_SERVICE_UNAVAILABLE)
        assertThat(response.contentAsString).contains("503-1")
    }

    @Test
    @DisplayName("admin 모드는 member public GET을 edge public-read가 아니므로 허용한다")
    fun `admin mode allows member public get endpoints`() {
        val filter = createFilter("admin")
        val request =
            MockHttpServletRequest("GET", "/member/api/v1/members/1/redirectToProfileImg")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_OK)
    }

    @Test
    @DisplayName("read 모드는 member public GET을 edge subset 밖이므로 차단한다")
    fun `read mode blocks member public get endpoints`() {
        val filter = createFilter("read")
        val request =
            MockHttpServletRequest("GET", "/member/api/v1/members/1/redirectToProfileImg")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_SERVICE_UNAVAILABLE)
    }

    @Test
    @DisplayName("isAllowed는 all 모드를 항상 허용한다")
    fun `isAllowed returns true for all mode`() {
        val filter = createFilter("all")
        val method =
            ApiRuntimeBoundaryFilter::class.java.getDeclaredMethod(
                "isAllowed",
                RuntimeApiMode::class.java,
                String::class.java,
                String::class.java,
            )
        method.isAccessible = true

        val allowed =
            method.invoke(
                filter,
                RuntimeApiMode.ALL,
                "GET",
                "/post/api/v1/posts/feed",
            ) as Boolean

        assertThat(allowed).isTrue()
    }

    @Test
    @DisplayName("PublicApiRequestMatcher publicApiRoutes는 contributor 경로를 노출한다")
    fun `public api routes are exposed from matcher`() {
        val routes = TestPublicApiRequestMatchers.defaultMatcher().publicApiRoutes()

        assertThat(routes).isNotEmpty
        assertThat(routes.map { it.pattern }).anyMatch { it.contains("/posts/feed") }
    }

    private fun createFilter(mode: String): ApiRuntimeBoundaryFilter =
        ApiRuntimeBoundaryFilter(
            mode,
            createApiCorsPolicy(),
            TestPublicApiRequestMatchers.defaultMatcher(),
        )

    private fun createApiCorsPolicy(): ApiCorsPolicy =
        ApiCorsPolicy(
            environment = MockEnvironment().withProperty("spring.profiles.active", "prod"),
            siteFrontUrl = "https://www.aquilaxk.site",
            siteBackUrl = "https://api.aquilaxk.site",
            siteCookieDomain = "aquilaxk.site",
        )
}
