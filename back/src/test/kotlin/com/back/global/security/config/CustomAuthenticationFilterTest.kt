package com.back.global.security.config

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.global.security.application.AuthIpSecurityService
import com.back.global.security.application.AuthSecurityEventService
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.Rq
import jakarta.servlet.http.HttpServlet
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.springframework.http.HttpHeaders
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import tools.jackson.databind.ObjectMapper

@DisplayName("CustomAuthenticationFilter 테스트")
class CustomAuthenticationFilterTest {
    @Test
    @DisplayName("보호 API에서 인증 처리 중 예기치 못한 예외가 발생하면 500 대신 401-1로 응답한다")
    fun `protected api unexpected auth error returns 401`() {
        val actorApplicationService = mock(ActorApplicationService::class.java)
        val authIpSecurityService = mock(AuthIpSecurityService::class.java)
        val authSecurityEventService = mock(AuthSecurityEventService::class.java)
        val authCookieService = mock(AuthCookieService::class.java)
        val publicApiRequestMatcher = mock(PublicApiRequestMatcher::class.java)
        val apiCorsPolicy = mock(ApiCorsPolicy::class.java)
        val rq = mock(Rq::class.java)
        val objectMapper = ObjectMapper()
        val request = MockHttpServletRequest("GET", "/member/api/v1/notifications/snapshot")
        request.addHeader(HttpHeaders.ORIGIN, "https://www.aquilaxk.site")

        given(publicApiRequestMatcher.matches(request)).willReturn(false)
        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("")
        given(rq.getCookieValue("apiKey", "")).willReturn("broken-api-key")
        given(rq.getCookieValue("accessToken", "")).willReturn("")
        given(actorApplicationService.findByApiKey("broken-api-key")).willThrow(RuntimeException("db down"))

        val filter =
            CustomAuthenticationFilter(
                actorApplicationService = actorApplicationService,
                authIpSecurityService = authIpSecurityService,
                authSecurityEventService = authSecurityEventService,
                authCookieService = authCookieService,
                objectMapper = objectMapper,
                publicApiRequestMatcher = publicApiRequestMatcher,
                apiCorsPolicy = apiCorsPolicy,
                rq = rq,
            )

        val response = MockHttpServletResponse()
        val filterChain = MockFilterChain()

        filter.doFilter(request, response, filterChain)

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED)
        assertThat(response.contentAsString).contains("\"resultCode\":\"401-1\"")
    }

    @Test
    @DisplayName("공개 API에서 인증 처리 중 예기치 못한 예외가 발생해도 익명으로 요청 처리를 계속한다")
    fun `public api unexpected auth error proceeds as anonymous`() {
        val actorApplicationService = mock(ActorApplicationService::class.java)
        val authIpSecurityService = mock(AuthIpSecurityService::class.java)
        val authSecurityEventService = mock(AuthSecurityEventService::class.java)
        val authCookieService = mock(AuthCookieService::class.java)
        val publicApiRequestMatcher = mock(PublicApiRequestMatcher::class.java)
        val apiCorsPolicy = mock(ApiCorsPolicy::class.java)
        val rq = mock(Rq::class.java)
        val objectMapper = ObjectMapper()
        val request = MockHttpServletRequest("GET", "/post/api/v1/posts")

        given(publicApiRequestMatcher.matches(request)).willReturn(true)
        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("")
        given(rq.getCookieValue("apiKey", "")).willReturn("broken-api-key")
        given(rq.getCookieValue("accessToken", "")).willReturn("")
        given(actorApplicationService.findByApiKey("broken-api-key")).willThrow(RuntimeException("db down"))

        val filter =
            CustomAuthenticationFilter(
                actorApplicationService = actorApplicationService,
                authIpSecurityService = authIpSecurityService,
                authSecurityEventService = authSecurityEventService,
                authCookieService = authCookieService,
                objectMapper = objectMapper,
                publicApiRequestMatcher = publicApiRequestMatcher,
                apiCorsPolicy = apiCorsPolicy,
                rq = rq,
            )

        val response = MockHttpServletResponse()
        val filterChain =
            MockFilterChain(
                object : HttpServlet() {
                    override fun service(
                        req: HttpServletRequest,
                        res: HttpServletResponse,
                    ) {
                        res.status = HttpServletResponse.SC_NO_CONTENT
                    }
                },
            )

        filter.doFilter(request, response, filterChain)

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_NO_CONTENT)
    }
}
