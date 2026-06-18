package com.back.global.security.config

import jakarta.servlet.http.Cookie
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.http.HttpHeaders
import org.springframework.mock.env.MockEnvironment
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import tools.jackson.databind.ObjectMapper

@DisplayName("ApiMutationCsrfGuardFilter 테스트")
class ApiMutationCsrfGuardFilterTest {
    @Test
    @DisplayName("쿠키 인증 mutation은 CSRF preflight 헤더가 없으면 403으로 차단한다")
    fun `cookie authenticated mutation without csrf preflight header is forbidden`() {
        val filter = createFilter()
        val request = MockHttpServletRequest("POST", "/post/api/v1/posts/1/comments")
        request.setCookies(Cookie(AuthCookieNames.API_KEY, "api-key"))
        request.addHeader(HttpHeaders.ORIGIN, "https://www.aquilaxk.site")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_FORBIDDEN)
        assertThat(response.contentAsString).contains("\"resultCode\":\"403-3\"")
        assertThat(response.getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isEqualTo("https://www.aquilaxk.site")
    }

    @Test
    @DisplayName("쿠키 인증 mutation은 CSRF preflight 헤더가 있으면 통과한다")
    fun `cookie authenticated mutation with csrf preflight header passes`() {
        val filter = createFilter()
        val request = MockHttpServletRequest("POST", "/post/api/v1/posts/1/comments")
        request.setCookies(Cookie(AuthCookieNames.API_KEY, "api-key"))
        request.addHeader(ApiMutationCsrfGuardFilter.CSRF_PREFLIGHT_HEADER, "1")
        val response = MockHttpServletResponse()
        val filterChain =
            MockFilterChain(
                object : jakarta.servlet.http.HttpServlet() {
                    override fun service(
                        req: HttpServletRequest,
                        res: HttpServletResponse,
                    ) {
                        res.status = HttpServletResponse.SC_CREATED
                    }
                },
            )

        filter.doFilter(request, response, filterChain)

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_CREATED)
    }

    @Test
    @DisplayName("context path가 붙은 API mutation도 실제 API 경로로 판정한다")
    fun `api mutation with context path is matched after removing context path`() {
        val filter = createFilter()
        val request = MockHttpServletRequest("POST", "/app/post/api/v1/posts/1/comments")
        request.contextPath = "/app"
        request.setCookies(Cookie(AuthCookieNames.API_KEY, "api-key"))
        request.addHeader(ApiMutationCsrfGuardFilter.CSRF_PREFLIGHT_HEADER, "1")
        val response = MockHttpServletResponse()
        val filterChain =
            MockFilterChain(
                object : jakarta.servlet.http.HttpServlet() {
                    override fun service(
                        req: HttpServletRequest,
                        res: HttpServletResponse,
                    ) {
                        res.status = HttpServletResponse.SC_CREATED
                    }
                },
            )

        filter.doFilter(request, response, filterChain)

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_CREATED)
    }

    @Test
    @DisplayName("허용되지 않은 Origin의 쿠키 인증 mutation은 CSRF 헤더가 있어도 403으로 차단한다")
    fun `cookie authenticated mutation from disallowed origin is forbidden`() {
        val filter = createFilter()
        val request = MockHttpServletRequest("POST", "/post/api/v1/posts/1/comments")
        request.setCookies(Cookie(AuthCookieNames.API_KEY, "api-key"))
        request.addHeader(HttpHeaders.ORIGIN, "https://evil.example")
        request.addHeader(ApiMutationCsrfGuardFilter.CSRF_PREFLIGHT_HEADER, "1")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_FORBIDDEN)
        assertThat(response.contentAsString).contains("\"resultCode\":\"403-2\"")
        assertThat(response.getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isNull()
    }

    @Test
    @DisplayName("인증 쿠키가 없는 mutation은 CSRF guard 대상이 아니다")
    fun `mutation without auth cookies passes csrf guard`() {
        val filter = createFilter()
        val request = MockHttpServletRequest("POST", "/post/api/v1/posts/1/hit")
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_OK)
    }

    private fun createFilter(): ApiMutationCsrfGuardFilter =
        ApiMutationCsrfGuardFilter(
            apiCorsPolicy =
                ApiCorsPolicy(
                    environment = MockEnvironment().withProperty("spring.profiles.active", "dev"),
                    siteFrontUrl = "https://www.aquilaxk.site",
                    siteBackUrl = "https://api.aquilaxk.site",
                    siteCookieDomain = "aquilaxk.site",
                ),
            objectMapper = ObjectMapper(),
        )
}
