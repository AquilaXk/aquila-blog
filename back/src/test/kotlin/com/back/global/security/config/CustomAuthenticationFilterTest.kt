package com.back.global.security.config

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import com.back.boundedContexts.member.subContexts.session.application.service.MemberSessionService
import com.back.global.app.AppConfig
import com.back.global.security.application.AuthIpSecurityService
import com.back.global.security.application.AuthSecurityEventService
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.ClientIpResolver
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
import org.springframework.security.core.context.SecurityContextHolder
import tools.jackson.databind.ObjectMapper

@DisplayName("CustomAuthenticationFilter 테스트")
class CustomAuthenticationFilterTest {
    @Test
    @DisplayName("보호 API에서 인증 처리 중 예기치 못한 예외가 발생하면 500 대신 401-1로 응답한다")
    fun `protected api unexpected auth error returns 401`() {
        val actorApplicationService = mock(ActorApplicationService::class.java)
        val memberSessionService = mock(MemberSessionService::class.java)
        val authIpSecurityService = mock(AuthIpSecurityService::class.java)
        val authSecurityEventService = mock(AuthSecurityEventService::class.java)
        val authCookieService = mock(AuthCookieService::class.java)
        val clientIpResolver = mock(ClientIpResolver::class.java)
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
        given(rq.getCookieValue("sessionKey", "")).willReturn("")
        given(clientIpResolver.resolve(request)).willReturn("203.0.113.10")
        given(actorApplicationService.findByApiKey("broken-api-key")).willThrow(RuntimeException("db down"))

        val filter =
            CustomAuthenticationFilter(
                actorApplicationService = actorApplicationService,
                memberSessionService = memberSessionService,
                authIpSecurityService = authIpSecurityService,
                authSecurityEventService = authSecurityEventService,
                authCookieService = authCookieService,
                clientIpResolver = clientIpResolver,
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
        val memberSessionService = mock(MemberSessionService::class.java)
        val authIpSecurityService = mock(AuthIpSecurityService::class.java)
        val authSecurityEventService = mock(AuthSecurityEventService::class.java)
        val authCookieService = mock(AuthCookieService::class.java)
        val clientIpResolver = mock(ClientIpResolver::class.java)
        val publicApiRequestMatcher = mock(PublicApiRequestMatcher::class.java)
        val apiCorsPolicy = mock(ApiCorsPolicy::class.java)
        val rq = mock(Rq::class.java)
        val objectMapper = ObjectMapper()
        val request = MockHttpServletRequest("GET", "/post/api/v1/posts")

        given(publicApiRequestMatcher.matches(request)).willReturn(true)
        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("")
        given(rq.getCookieValue("apiKey", "")).willReturn("broken-api-key")
        given(rq.getCookieValue("accessToken", "")).willReturn("")
        given(rq.getCookieValue("sessionKey", "")).willReturn("")
        given(clientIpResolver.resolve(request)).willReturn("203.0.113.11")
        given(actorApplicationService.findByApiKey("broken-api-key")).willThrow(RuntimeException("db down"))

        val filter =
            CustomAuthenticationFilter(
                actorApplicationService = actorApplicationService,
                memberSessionService = memberSessionService,
                authIpSecurityService = authIpSecurityService,
                authSecurityEventService = authSecurityEventService,
                authCookieService = authCookieService,
                clientIpResolver = clientIpResolver,
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

    @Test
    @DisplayName("payload email 누락 토큰은 DB 회원 기준으로 권한을 복구하고 accessToken을 재발급한다")
    fun `legacy payload without email restores admin authority from persisted member`() {
        AppConfig(
            siteBackUrl = "https://api.aquilaxk.site",
            siteFrontUrl = "https://www.aquilaxk.site",
            adminUsername = "admin",
            adminEmail = "admin@test.com",
            adminPassword = "secret",
        )

        val actorApplicationService = mock(ActorApplicationService::class.java)
        val memberSessionService = mock(MemberSessionService::class.java)
        val authIpSecurityService = mock(AuthIpSecurityService::class.java)
        val authSecurityEventService = mock(AuthSecurityEventService::class.java)
        val authCookieService = mock(AuthCookieService::class.java)
        val clientIpResolver = mock(ClientIpResolver::class.java)
        val publicApiRequestMatcher = mock(PublicApiRequestMatcher::class.java)
        val apiCorsPolicy = mock(ApiCorsPolicy::class.java)
        val rq = mock(Rq::class.java)
        val objectMapper = ObjectMapper()
        val request = MockHttpServletRequest("PUT", "/post/api/v1/posts/452")
        val legacyToken = "legacy-access-token"
        val persistedAdmin = Member(54L, "internal-admin", null, "aquila", "admin@test.com")

        given(publicApiRequestMatcher.matches(request)).willReturn(false)
        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("Bearer $legacyToken")
        given(rq.getCookieValue("sessionKey", "")).willReturn("")
        given(actorApplicationService.payload(legacyToken))
            .willReturn(
                AccessTokenPayload(
                    id = 54L,
                    username = "internal-admin",
                    email = null,
                    name = "aquila",
                    rememberLoginEnabled = true,
                    ipSecurityEnabled = false,
                    ipSecurityFingerprint = null,
                ),
            )
        given(actorApplicationService.findById(54L)).willReturn(persistedAdmin)
        given(actorApplicationService.genAccessToken(persistedAdmin)).willReturn("rotated-access-token")
        given(clientIpResolver.resolve(request)).willReturn("203.0.113.12")

        val filter =
            CustomAuthenticationFilter(
                actorApplicationService = actorApplicationService,
                memberSessionService = memberSessionService,
                authIpSecurityService = authIpSecurityService,
                authSecurityEventService = authSecurityEventService,
                authCookieService = authCookieService,
                clientIpResolver = clientIpResolver,
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
                        val authentication = SecurityContextHolder.getContext().authentication
                        val hasAdminRole =
                            authentication
                                ?.authorities
                                ?.any { authority -> authority.authority == "ROLE_ADMIN" }
                                ?: false
                        if (!hasAdminRole) {
                            res.status = HttpServletResponse.SC_FORBIDDEN
                            return
                        }
                        res.status = HttpServletResponse.SC_NO_CONTENT
                    }
                },
            )

        try {
            filter.doFilter(request, response, filterChain)
            assertThat(response.status).isEqualTo(HttpServletResponse.SC_NO_CONTENT)
        } finally {
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    @DisplayName("쓰기 요청에서 accessToken payload 권한이 오래된 경우 apiKey 기준 DB 권한으로 재구성한다")
    fun `mutating request prefers apiKey member authority over stale token payload`() {
        AppConfig(
            siteBackUrl = "https://api.aquilaxk.site",
            siteFrontUrl = "https://www.aquilaxk.site",
            adminUsername = "admin",
            adminEmail = "admin@test.com",
            adminPassword = "secret",
        )

        val actorApplicationService = mock(ActorApplicationService::class.java)
        val memberSessionService = mock(MemberSessionService::class.java)
        val authIpSecurityService = mock(AuthIpSecurityService::class.java)
        val authSecurityEventService = mock(AuthSecurityEventService::class.java)
        val authCookieService = mock(AuthCookieService::class.java)
        val clientIpResolver = mock(ClientIpResolver::class.java)
        val publicApiRequestMatcher = mock(PublicApiRequestMatcher::class.java)
        val apiCorsPolicy = mock(ApiCorsPolicy::class.java)
        val rq = mock(Rq::class.java)
        val objectMapper = ObjectMapper()
        val request = MockHttpServletRequest("PUT", "/post/api/v1/posts/452")
        val apiKey = "admin-api-key"
        val staleAccessToken = "stale-access-token"
        val persistedAdmin = Member(54L, "internal-admin", null, "aquila", "admin@test.com", apiKey)

        given(publicApiRequestMatcher.matches(request)).willReturn(false)
        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("")
        given(rq.getCookieValue("apiKey", "")).willReturn(apiKey)
        given(rq.getCookieValue("accessToken", "")).willReturn(staleAccessToken)
        given(rq.getCookieValue("sessionKey", "")).willReturn("")
        given(actorApplicationService.payload(staleAccessToken))
            .willReturn(
                AccessTokenPayload(
                    id = 54L,
                    username = "internal-admin",
                    email = "old-admin@test.com",
                    name = "aquila",
                    rememberLoginEnabled = true,
                    ipSecurityEnabled = false,
                    ipSecurityFingerprint = null,
                ),
            )
        given(actorApplicationService.findByApiKey(apiKey)).willReturn(persistedAdmin)
        given(actorApplicationService.genAccessToken(persistedAdmin)).willReturn("rotated-access-token")
        given(clientIpResolver.resolve(request)).willReturn("203.0.113.13")

        val filter =
            CustomAuthenticationFilter(
                actorApplicationService = actorApplicationService,
                memberSessionService = memberSessionService,
                authIpSecurityService = authIpSecurityService,
                authSecurityEventService = authSecurityEventService,
                authCookieService = authCookieService,
                clientIpResolver = clientIpResolver,
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
                        val authentication = SecurityContextHolder.getContext().authentication
                        val hasAdminRole =
                            authentication
                                ?.authorities
                                ?.any { authority -> authority.authority == "ROLE_ADMIN" }
                                ?: false
                        if (!hasAdminRole) {
                            res.status = HttpServletResponse.SC_FORBIDDEN
                            return
                        }
                        res.status = HttpServletResponse.SC_NO_CONTENT
                    }
                },
            )

        try {
            filter.doFilter(request, response, filterChain)
            assertThat(response.status).isEqualTo(HttpServletResponse.SC_NO_CONTENT)
        } finally {
            SecurityContextHolder.clearContext()
        }
    }
}
