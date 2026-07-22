package com.back.global.security.config

import jakarta.servlet.http.HttpServletResponse
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.springframework.mock.env.MockEnvironment
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import java.util.stream.Stream

@DisplayName("ApiRuntimeBoundaryFilter route×method×role×mode matrix")
class ApiRuntimeBoundaryMatrixTest {
    @ParameterizedTest(name = "{0} {1} role={2} mode={3} -> allowed={4}")
    @MethodSource("matrixCases")
    fun `runtime boundary matrix`(
        method: String,
        path: String,
        @Suppress("UNUSED_PARAMETER") role: String,
        mode: String,
        allowed: Boolean,
    ) {
        val filter =
            ApiRuntimeBoundaryFilter(
                mode,
                createApiCorsPolicy(),
                TestPublicApiRequestMatchers.defaultMatcher(),
            )
        val request = MockHttpServletRequest(method, path)
        val response = MockHttpServletResponse()

        filter.doFilter(request, response, MockFilterChain())

        if (allowed) {
            assertThat(response.status).isEqualTo(HttpServletResponse.SC_OK)
        } else {
            assertThat(response.status).isEqualTo(HttpServletResponse.SC_SERVICE_UNAVAILABLE)
            assertThat(response.contentAsString).contains("503-1")
        }
    }

    @Test
    @DisplayName("invalid apiMode는 필터 생성 시 IllegalStateException으로 boot fail한다")
    fun `invalid api mode fails filter construction`() {
        assertThatThrownBy {
            ApiRuntimeBoundaryFilter(
                "typo",
                createApiCorsPolicy(),
                TestPublicApiRequestMatchers.defaultMatcher(),
            )
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Unknown custom.runtime.apiMode='typo'")
    }

    private fun createApiCorsPolicy(): ApiCorsPolicy =
        ApiCorsPolicy(
            environment = MockEnvironment().withProperty("spring.profiles.active", "prod"),
            siteFrontUrl = "https://www.aquilaxk.site",
            siteBackUrl = "https://api.aquilaxk.site",
            siteCookieDomain = "aquilaxk.site",
        )

    companion object {
        @JvmStatic
        fun matrixCases(): Stream<Arguments> {
            val roles = listOf("anonymous", "member", "admin")
            val routes =
                listOf(
                    RouteCase("GET", "/post/api/v1/posts/related/author", publicReadSafe = true),
                    RouteCase("GET", "/post/api/v1/images/posts/2026/03/cover.webp", publicReadSafe = true),
                    RouteCase("GET", "/post/api/v1/files/posts/2026/03/manual.pdf", publicReadSafe = true),
                    RouteCase("HEAD", "/post/api/v1/files/posts/2026/03/manual.pdf", publicReadSafe = true),
                    RouteCase("GET", "/post/api/v1/posts/466/comments", publicReadSafe = true),
                    RouteCase("POST", "/post/api/v1/posts/466/hit", publicReadSafe = false),
                    RouteCase("POST", "/member/api/v1/auth/login", publicReadSafe = false),
                    RouteCase("OPTIONS", "/post/api/v1/posts/466/comments", publicReadSafe = false, options = true),
                )
            val modes =
                listOf(
                    ModeCase("all", allowAll = true),
                    ModeCase("read", allowPublicReadSafe = true, allowOptions = true),
                    ModeCase("admin", allowNonPublicRead = true, allowOptions = true),
                    ModeCase("worker", allowNothingExceptOptions = true),
                    ModeCase("none", allowNothingExceptOptions = true),
                )

            return roles
                .flatMap { role ->
                    routes.flatMap { route ->
                        modes.map { mode ->
                            val allowed =
                                when {
                                    mode.allowAll -> true
                                    route.options && mode.allowOptions -> true
                                    mode.allowPublicReadSafe && route.publicReadSafe -> true
                                    mode.allowNonPublicRead && !route.publicReadSafe && !route.options -> true
                                    mode.allowNothingExceptOptions && route.options -> true
                                    else -> false
                                }
                            Arguments.of(route.method, route.path, role, mode.name, allowed)
                        }
                    }
                }.stream()
        }

        private data class RouteCase(
            val method: String,
            val path: String,
            val publicReadSafe: Boolean,
            val options: Boolean = false,
        )

        private data class ModeCase(
            val name: String,
            val allowAll: Boolean = false,
            val allowPublicReadSafe: Boolean = false,
            val allowNonPublicRead: Boolean = false,
            val allowOptions: Boolean = false,
            val allowNothingExceptOptions: Boolean = false,
        )
    }
}
