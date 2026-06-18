package com.back.global.security.config

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot
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
import org.assertj.core.api.Assertions.assertThatCode
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.springframework.http.HttpHeaders
import org.springframework.mock.env.MockEnvironment
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.core.context.SecurityContextHolder
import tools.jackson.databind.ObjectMapper
import java.lang.reflect.Modifier
import java.time.Instant

@DisplayName("CustomAuthenticationFilter 테스트")
class CustomAuthenticationFilterTest {
    @Test
    @DisplayName("인증 세부 경로는 전용 handler와 resolver 경계로 분리되어 있다")
    fun `authentication path responsibilities are extracted to handlers`() {
        val extractedBoundaryTypes =
            listOf(
                "com.back.global.security.config.MemberSessionAuthenticationResolver",
                "com.back.global.security.config.AccessTokenAuthenticationHandler",
                "com.back.global.security.config.ApiKeyAuthorityRefreshHandler",
                "com.back.global.security.config.LegacyPayloadRecoveryHandler",
                "com.back.global.security.config.RefreshTokenAuthenticationHandler",
            ).map(Class<*>::forName)

        assertThat(extractedBoundaryTypes.map { it.simpleName })
            .containsExactly(
                "MemberSessionAuthenticationResolver",
                "AccessTokenAuthenticationHandler",
                "ApiKeyAuthorityRefreshHandler",
                "LegacyPayloadRecoveryHandler",
                "RefreshTokenAuthenticationHandler",
            )

        val privateMethodNames =
            CustomAuthenticationFilter::class.java.declaredMethods
                .filter { Modifier.isPrivate(it.modifiers) }
                .map { it.name }

        assertThat(privateMethodNames)
            .doesNotContain(
                "resolveMemberSession",
                "ensureSessionIsUsable",
                "canUseFreshTokenSessionFallback",
                "resolveTokenLoginIdentifier",
                "resolvePrincipalUsername",
                "shouldPreferApiKeyAuthorityOnWrite",
            )
    }

    @Test
    @DisplayName("세션 검증 resolver는 세션이 선택 사항인 경로에서 쿠키를 만료하지 않는다")
    fun `session resolver keeps optional missing session usable`() {
        val memberSessionUseCase = mock(MemberSessionUseCase::class.java)
        val authCookieService = mock(AuthCookieService::class.java)
        val resolver =
            MemberSessionAuthenticationResolver(
                memberSessionUseCase = memberSessionUseCase,
                authCookieService = authCookieService,
                freshLookupGraceSeconds = 15,
            )

        assertThatCode {
            resolver.ensureUsable(MemberSessionResolution(sessionKeyProvided = false, session = null))
        }.doesNotThrowAnyException()

        verify(authCookieService, never()).expireAuthCookies()
    }

    @Test
    @DisplayName("legacy payload에 email과 username이 없고 DB 회원도 없으면 member id 기반 principal로 인증한다")
    fun `legacy payload without persisted member falls back to member id principal`() {
        val actorApplicationService = mock(ActorApplicationService::class.java)
        val memberSessionUseCase = mock(MemberSessionUseCase::class.java)
        val authIpSecurityService = mock(AuthIpSecurityService::class.java)
        val authSecurityEventService = mock(AuthSecurityEventService::class.java)
        val authCookieService = mock(AuthCookieService::class.java)
        val rq = mock(Rq::class.java)
        val accessToken = "legacy-access-token"
        val sessionKey = "legacy-session-key"
        val request = MockHttpServletRequest("GET", "/member/api/v1/auth/session")
        val sessionSnapshot =
            MemberSessionAuthSnapshot(
                id = 11L,
                memberId = 54L,
                sessionKey = sessionKey,
                rememberLoginEnabled = false,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                lastAuthenticatedAt = Instant.now(),
            )
        val sessionResolver =
            MemberSessionAuthenticationResolver(
                memberSessionUseCase = memberSessionUseCase,
                authCookieService = authCookieService,
                freshLookupGraceSeconds = 15,
            )
        val ipSecurityVerifier =
            AuthIpSecurityVerifier(
                authIpSecurityService,
                authSecurityEventService,
                authCookieService,
                memberSessionUseCase,
            )
        val securityContextAuthenticationWriter = SecurityContextAuthenticationWriter()
        val handler =
            AccessTokenAuthenticationHandler(
                actorApplicationService = actorApplicationService,
                memberSessionUseCase = memberSessionUseCase,
                authIpSecurityVerifier = ipSecurityVerifier,
                securityContextAuthenticationWriter = securityContextAuthenticationWriter,
                memberSessionAuthenticationResolver = sessionResolver,
                apiKeyAuthorityRefreshHandler =
                    ApiKeyAuthorityRefreshHandler(
                        actorApplicationService = actorApplicationService,
                        memberSessionUseCase = memberSessionUseCase,
                        authCookieService = authCookieService,
                        authIpSecurityVerifier = ipSecurityVerifier,
                        securityContextAuthenticationWriter = securityContextAuthenticationWriter,
                        memberSessionAuthenticationResolver = sessionResolver,
                        rq = rq,
                    ),
                legacyPayloadRecoveryHandler =
                    LegacyPayloadRecoveryHandler(
                        actorApplicationService = actorApplicationService,
                        memberSessionUseCase = memberSessionUseCase,
                        authCookieService = authCookieService,
                        securityContextAuthenticationWriter = securityContextAuthenticationWriter,
                        rq = rq,
                    ),
            )

        given(actorApplicationService.payload(accessToken))
            .willReturn(
                AccessTokenPayload(
                    id = 54L,
                    sessionKey = sessionKey,
                    username = null,
                    email = null,
                    name = "aquila",
                    rememberLoginEnabled = false,
                    ipSecurityEnabled = false,
                    ipSecurityFingerprint = null,
                ),
            )
        given(memberSessionUseCase.findActiveSessionSnapshot(54L, sessionKey)).willReturn(sessionSnapshot)
        given(actorApplicationService.findById(54L)).willReturn(null)

        try {
            val handled =
                handler.authenticate(
                    request = request,
                    tokens =
                        ExtractedAuthTokens(
                            apiKey = "",
                            accessToken = accessToken,
                            sessionKey = sessionKey,
                            refreshToken = "",
                        ),
                    clientIp = "203.0.113.30",
                )

            assertThat(handled).isTrue()
            val authentication = SecurityContextHolder.getContext().authentication
            assertThat(authentication).isNotNull()
            assertThat(authentication?.name).isEqualTo("member-54")
            verify(memberSessionUseCase).touchAuthenticated(sessionSnapshot)
            verify(authCookieService, never()).issueAccessToken(
                ArgumentMatchers.anyString(),
                ArgumentMatchers.anyBoolean(),
                ArgumentMatchers.nullable(String::class.java),
                ArgumentMatchers.nullable(String::class.java),
            )
        } finally {
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    @DisplayName("prod Swagger와 OpenAPI 문서 경로도 쿠키 인증 필터 대상이다")
    fun `prod api docs paths are authentication filter targets`() {
        val actorApplicationService = mock(ActorApplicationService::class.java)
        val memberSessionUseCase = mock(MemberSessionUseCase::class.java)
        val authIpSecurityService = mock(AuthIpSecurityService::class.java)
        val authSecurityEventService = mock(AuthSecurityEventService::class.java)
        val authCookieService = mock(AuthCookieService::class.java)
        val clientIpResolver = mock(ClientIpResolver::class.java)
        val publicApiRequestMatcher = mock(PublicApiRequestMatcher::class.java)
        val apiCorsPolicy = mock(ApiCorsPolicy::class.java)
        val rq = mock(Rq::class.java)
        val objectMapper = ObjectMapper()
        val accessToken = "broken-access-token"
        val filter =
            CustomAuthenticationFilter(
                actorApplicationService = actorApplicationService,
                memberSessionUseCase = memberSessionUseCase,
                authCookieService = authCookieService,
                authTokenExtractor = AuthTokenExtractor(rq),
                authIpSecurityVerifier =
                    AuthIpSecurityVerifier(
                        authIpSecurityService,
                        authSecurityEventService,
                        authCookieService,
                        memberSessionUseCase,
                    ),
                securityContextAuthenticationWriter = SecurityContextAuthenticationWriter(),
                clientIpResolver = clientIpResolver,
                objectMapper = objectMapper,
                publicApiRequestMatcher = publicApiRequestMatcher,
                apiCorsPolicy = apiCorsPolicy,
                environment = MockEnvironment().apply { setActiveProfiles("prod") },
                rq = rq,
                freshLookupGraceSeconds = 15,
            )

        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("")
        given(rq.getCookieValue(AuthCookieNames.API_KEY, "")).willReturn("")
        given(rq.getCookieValue(AuthCookieNames.ACCESS_TOKEN, "")).willReturn(accessToken)
        given(rq.getCookieValue(AuthCookieNames.SESSION_KEY, "")).willReturn("")
        given(rq.getCookieValue(AuthCookieNames.REFRESH_TOKEN, "")).willReturn("")
        given(actorApplicationService.payload(accessToken)).willThrow(RuntimeException("jwt down"))

        listOf(
            "/swagger-ui/index.html",
            "/v3/api-docs",
            "/v3/api-docs/swagger-config",
        ).forEach { path ->
            val request = MockHttpServletRequest("GET", path)
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

            given(publicApiRequestMatcher.matches(request)).willReturn(false)
            given(clientIpResolver.resolve(request)).willReturn("203.0.113.20")

            filter.doFilter(request, response, filterChain)

            assertThat(response.status).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED)
            assertThat(response.contentAsString).contains("\"resultCode\":\"401-1\"")
        }
    }

    @Test
    @DisplayName("non-prod 공개 문서 경로는 stale 인증 쿠키가 있어도 필터를 건너뛴다")
    fun `non prod public docs paths skip stale auth cookies`() {
        val actorApplicationService = mock(ActorApplicationService::class.java)
        val memberSessionUseCase = mock(MemberSessionUseCase::class.java)
        val authIpSecurityService = mock(AuthIpSecurityService::class.java)
        val authSecurityEventService = mock(AuthSecurityEventService::class.java)
        val authCookieService = mock(AuthCookieService::class.java)
        val clientIpResolver = mock(ClientIpResolver::class.java)
        val publicApiRequestMatcher = mock(PublicApiRequestMatcher::class.java)
        val apiCorsPolicy = mock(ApiCorsPolicy::class.java)
        val rq = mock(Rq::class.java)
        val objectMapper = ObjectMapper()
        val filter =
            CustomAuthenticationFilter(
                actorApplicationService = actorApplicationService,
                memberSessionUseCase = memberSessionUseCase,
                authCookieService = authCookieService,
                authTokenExtractor = AuthTokenExtractor(rq),
                authIpSecurityVerifier =
                    AuthIpSecurityVerifier(
                        authIpSecurityService,
                        authSecurityEventService,
                        authCookieService,
                        memberSessionUseCase,
                    ),
                securityContextAuthenticationWriter = SecurityContextAuthenticationWriter(),
                clientIpResolver = clientIpResolver,
                objectMapper = objectMapper,
                publicApiRequestMatcher = publicApiRequestMatcher,
                apiCorsPolicy = apiCorsPolicy,
                environment = MockEnvironment().apply { setActiveProfiles("test") },
                rq = rq,
                freshLookupGraceSeconds = 15,
            )

        listOf(
            "/swagger-ui/index.html",
            "/v3/api-docs",
            "/v3/api-docs/swagger-config",
        ).forEach { path ->
            val request = MockHttpServletRequest("GET", path)
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

        verify(actorApplicationService, never()).payload("broken-access-token")
    }

    @Test
    @DisplayName("보호 API에서 인증 처리 중 예기치 못한 예외가 발생하면 500 대신 401-1로 응답한다")
    fun `protected api unexpected auth error returns 401`() {
        val actorApplicationService = mock(ActorApplicationService::class.java)
        val memberSessionUseCase = mock(MemberSessionUseCase::class.java)
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
        given(rq.getCookieValue(AuthCookieNames.API_KEY, "")).willReturn("")
        given(rq.getCookieValue(AuthCookieNames.ACCESS_TOKEN, "")).willReturn("broken-access-token")
        given(rq.getCookieValue(AuthCookieNames.SESSION_KEY, "")).willReturn("")
        given(rq.getCookieValue(AuthCookieNames.REFRESH_TOKEN, "")).willReturn("")
        given(clientIpResolver.resolve(request)).willReturn("203.0.113.10")
        given(actorApplicationService.payload("broken-access-token")).willThrow(RuntimeException("jwt down"))

        val filter =
            CustomAuthenticationFilter(
                actorApplicationService = actorApplicationService,
                memberSessionUseCase = memberSessionUseCase,
                authCookieService = authCookieService,
                authTokenExtractor = AuthTokenExtractor(rq),
                authIpSecurityVerifier =
                    AuthIpSecurityVerifier(
                        authIpSecurityService,
                        authSecurityEventService,
                        authCookieService,
                        memberSessionUseCase,
                    ),
                securityContextAuthenticationWriter = SecurityContextAuthenticationWriter(),
                clientIpResolver = clientIpResolver,
                objectMapper = objectMapper,
                publicApiRequestMatcher = publicApiRequestMatcher,
                apiCorsPolicy = apiCorsPolicy,
                environment = MockEnvironment().apply { setActiveProfiles("test") },
                rq = rq,
                freshLookupGraceSeconds = 15,
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
        val memberSessionUseCase = mock(MemberSessionUseCase::class.java)
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
        given(rq.getCookieValue(AuthCookieNames.API_KEY, "")).willReturn("")
        given(rq.getCookieValue(AuthCookieNames.ACCESS_TOKEN, "")).willReturn("broken-access-token")
        given(rq.getCookieValue(AuthCookieNames.SESSION_KEY, "")).willReturn("")
        given(rq.getCookieValue(AuthCookieNames.REFRESH_TOKEN, "")).willReturn("")
        given(clientIpResolver.resolve(request)).willReturn("203.0.113.11")
        given(actorApplicationService.payload("broken-access-token")).willThrow(RuntimeException("jwt down"))

        val filter =
            CustomAuthenticationFilter(
                actorApplicationService = actorApplicationService,
                memberSessionUseCase = memberSessionUseCase,
                authCookieService = authCookieService,
                authTokenExtractor = AuthTokenExtractor(rq),
                authIpSecurityVerifier =
                    AuthIpSecurityVerifier(
                        authIpSecurityService,
                        authSecurityEventService,
                        authCookieService,
                        memberSessionUseCase,
                    ),
                securityContextAuthenticationWriter = SecurityContextAuthenticationWriter(),
                clientIpResolver = clientIpResolver,
                objectMapper = objectMapper,
                publicApiRequestMatcher = publicApiRequestMatcher,
                apiCorsPolicy = apiCorsPolicy,
                environment = MockEnvironment().apply { setActiveProfiles("test") },
                rq = rq,
                freshLookupGraceSeconds = 15,
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
        val memberSessionUseCase = mock(MemberSessionUseCase::class.java)
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
        val sessionKey = "legacy-session-key"
        val sessionSnapshot =
            MemberSessionAuthSnapshot(
                id = 10L,
                memberId = 54L,
                sessionKey = sessionKey,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                lastAuthenticatedAt = Instant.now(),
            )
        val persistedAdmin = Member(54L, "internal-admin", null, "aquila", "admin@test.com")

        given(publicApiRequestMatcher.matches(request)).willReturn(false)
        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("Bearer $legacyToken")
        given(rq.getCookieValue(AuthCookieNames.SESSION_KEY, "")).willReturn(sessionKey)
        given(actorApplicationService.payload(legacyToken))
            .willReturn(
                AccessTokenPayload(
                    id = 54L,
                    sessionKey = sessionKey,
                    username = "internal-admin",
                    email = null,
                    name = "aquila",
                    rememberLoginEnabled = true,
                    ipSecurityEnabled = false,
                    ipSecurityFingerprint = null,
                ),
            )
        given(memberSessionUseCase.findActiveSessionSnapshot(54L, sessionKey)).willReturn(sessionSnapshot)
        given(actorApplicationService.findById(54L)).willReturn(persistedAdmin)
        given(actorApplicationService.genAccessToken(persistedAdmin, sessionKey, true, false, null)).willReturn("rotated-access-token")
        given(clientIpResolver.resolve(request)).willReturn("203.0.113.12")

        val filter =
            CustomAuthenticationFilter(
                actorApplicationService = actorApplicationService,
                memberSessionUseCase = memberSessionUseCase,
                authCookieService = authCookieService,
                authTokenExtractor = AuthTokenExtractor(rq),
                authIpSecurityVerifier =
                    AuthIpSecurityVerifier(
                        authIpSecurityService,
                        authSecurityEventService,
                        authCookieService,
                        memberSessionUseCase,
                    ),
                securityContextAuthenticationWriter = SecurityContextAuthenticationWriter(),
                clientIpResolver = clientIpResolver,
                objectMapper = objectMapper,
                publicApiRequestMatcher = publicApiRequestMatcher,
                apiCorsPolicy = apiCorsPolicy,
                environment = MockEnvironment().apply { setActiveProfiles("test") },
                rq = rq,
                freshLookupGraceSeconds = 15,
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
        val memberSessionUseCase = mock(MemberSessionUseCase::class.java)
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
        val sessionKey = "admin-session-key"
        val sessionSnapshot =
            MemberSessionAuthSnapshot(
                id = 11L,
                memberId = 54L,
                sessionKey = sessionKey,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                lastAuthenticatedAt = Instant.now(),
            )
        val persistedAdmin = Member(54L, "internal-admin", null, "aquila", "admin@test.com", apiKey)

        given(publicApiRequestMatcher.matches(request)).willReturn(false)
        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("")
        given(rq.getCookieValue(AuthCookieNames.API_KEY, "")).willReturn(apiKey)
        given(rq.getCookieValue(AuthCookieNames.ACCESS_TOKEN, "")).willReturn(staleAccessToken)
        given(rq.getCookieValue(AuthCookieNames.SESSION_KEY, "")).willReturn(sessionKey)
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
        given(memberSessionUseCase.findActiveSessionSnapshot(54L, sessionKey)).willReturn(sessionSnapshot)
        given(actorApplicationService.genAccessToken(persistedAdmin, sessionKey, true, false, null)).willReturn("rotated-access-token")
        given(clientIpResolver.resolve(request)).willReturn("203.0.113.13")

        val filter =
            CustomAuthenticationFilter(
                actorApplicationService = actorApplicationService,
                memberSessionUseCase = memberSessionUseCase,
                authCookieService = authCookieService,
                authTokenExtractor = AuthTokenExtractor(rq),
                authIpSecurityVerifier =
                    AuthIpSecurityVerifier(
                        authIpSecurityService,
                        authSecurityEventService,
                        authCookieService,
                        memberSessionUseCase,
                    ),
                securityContextAuthenticationWriter = SecurityContextAuthenticationWriter(),
                clientIpResolver = clientIpResolver,
                objectMapper = objectMapper,
                publicApiRequestMatcher = publicApiRequestMatcher,
                apiCorsPolicy = apiCorsPolicy,
                environment = MockEnvironment().apply { setActiveProfiles("test") },
                rq = rq,
                freshLookupGraceSeconds = 15,
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
    @DisplayName("로그인 직후 GET read 요청은 세션 snapshot miss여도 최근 accessToken이면 1회 fallback 인증을 허용한다")
    fun `fresh token fallback allows safe read request`() {
        val actorApplicationService = mock(ActorApplicationService::class.java)
        val memberSessionUseCase = mock(MemberSessionUseCase::class.java)
        val authIpSecurityService = mock(AuthIpSecurityService::class.java)
        val authSecurityEventService = mock(AuthSecurityEventService::class.java)
        val authCookieService = mock(AuthCookieService::class.java)
        val clientIpResolver = mock(ClientIpResolver::class.java)
        val publicApiRequestMatcher = mock(PublicApiRequestMatcher::class.java)
        val apiCorsPolicy = mock(ApiCorsPolicy::class.java)
        val rq = mock(Rq::class.java)
        val objectMapper = ObjectMapper()
        val request = MockHttpServletRequest("GET", "/member/api/v1/auth/session")
        val accessToken = "fresh-access-token"
        val sessionKey = "fresh-session-key"

        given(publicApiRequestMatcher.matches(request)).willReturn(false)
        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("Bearer $accessToken")
        given(rq.getCookieValue(AuthCookieNames.SESSION_KEY, "")).willReturn(sessionKey)
        given(clientIpResolver.resolve(request)).willReturn("203.0.113.14")
        given(actorApplicationService.payload(accessToken))
            .willReturn(
                AccessTokenPayload(
                    id = 54L,
                    sessionKey = sessionKey,
                    username = "internal-admin",
                    email = "admin@test.com",
                    name = "aquila",
                    rememberLoginEnabled = true,
                    ipSecurityEnabled = false,
                    ipSecurityFingerprint = null,
                    issuedAt = Instant.now(),
                ),
            )
        given(memberSessionUseCase.findActiveSessionSnapshot(54L, sessionKey)).willReturn(null)

        val filter =
            CustomAuthenticationFilter(
                actorApplicationService = actorApplicationService,
                memberSessionUseCase = memberSessionUseCase,
                authCookieService = authCookieService,
                authTokenExtractor = AuthTokenExtractor(rq),
                authIpSecurityVerifier =
                    AuthIpSecurityVerifier(
                        authIpSecurityService,
                        authSecurityEventService,
                        authCookieService,
                        memberSessionUseCase,
                    ),
                securityContextAuthenticationWriter = SecurityContextAuthenticationWriter(),
                clientIpResolver = clientIpResolver,
                objectMapper = objectMapper,
                publicApiRequestMatcher = publicApiRequestMatcher,
                apiCorsPolicy = apiCorsPolicy,
                environment = MockEnvironment().apply { setActiveProfiles("test") },
                rq = rq,
                freshLookupGraceSeconds = 15,
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

        try {
            filter.doFilter(request, response, filterChain)
            assertThat(response.status).isEqualTo(HttpServletResponse.SC_NO_CONTENT)
            verify(authCookieService, never()).expireAuthCookies()
        } finally {
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    @DisplayName("로그인 직후라도 쓰기 요청은 세션 snapshot miss fallback을 허용하지 않는다")
    fun `fresh token fallback does not allow mutating request`() {
        val actorApplicationService = mock(ActorApplicationService::class.java)
        val memberSessionUseCase = mock(MemberSessionUseCase::class.java)
        val authIpSecurityService = mock(AuthIpSecurityService::class.java)
        val authSecurityEventService = mock(AuthSecurityEventService::class.java)
        val authCookieService = mock(AuthCookieService::class.java)
        val clientIpResolver = mock(ClientIpResolver::class.java)
        val publicApiRequestMatcher = mock(PublicApiRequestMatcher::class.java)
        val apiCorsPolicy = mock(ApiCorsPolicy::class.java)
        val rq = mock(Rq::class.java)
        val objectMapper = ObjectMapper()
        val request = MockHttpServletRequest("POST", "/member/api/v1/auth/me")
        val accessToken = "fresh-access-token"
        val sessionKey = "fresh-session-key"

        given(publicApiRequestMatcher.matches(request)).willReturn(false)
        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("Bearer $accessToken")
        given(rq.getCookieValue(AuthCookieNames.SESSION_KEY, "")).willReturn(sessionKey)
        given(clientIpResolver.resolve(request)).willReturn("203.0.113.15")
        given(actorApplicationService.payload(accessToken))
            .willReturn(
                AccessTokenPayload(
                    id = 54L,
                    sessionKey = sessionKey,
                    username = "internal-admin",
                    email = "admin@test.com",
                    name = "aquila",
                    rememberLoginEnabled = true,
                    ipSecurityEnabled = false,
                    ipSecurityFingerprint = null,
                    issuedAt = Instant.now(),
                ),
            )
        given(memberSessionUseCase.findActiveSessionSnapshot(54L, sessionKey)).willReturn(null)

        val filter =
            CustomAuthenticationFilter(
                actorApplicationService = actorApplicationService,
                memberSessionUseCase = memberSessionUseCase,
                authCookieService = authCookieService,
                authTokenExtractor = AuthTokenExtractor(rq),
                authIpSecurityVerifier =
                    AuthIpSecurityVerifier(
                        authIpSecurityService,
                        authSecurityEventService,
                        authCookieService,
                        memberSessionUseCase,
                    ),
                securityContextAuthenticationWriter = SecurityContextAuthenticationWriter(),
                clientIpResolver = clientIpResolver,
                objectMapper = objectMapper,
                publicApiRequestMatcher = publicApiRequestMatcher,
                apiCorsPolicy = apiCorsPolicy,
                environment = MockEnvironment().apply { setActiveProfiles("test") },
                rq = rq,
                freshLookupGraceSeconds = 15,
            )

        val response = MockHttpServletResponse()
        val filterChain = MockFilterChain()

        try {
            filter.doFilter(request, response, filterChain)
            assertThat(response.status).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED)
            assertThat(response.contentAsString).contains("\"resultCode\":\"401-8\"")
            verify(authCookieService).expireAuthCookies()
        } finally {
            SecurityContextHolder.clearContext()
        }
    }
}
