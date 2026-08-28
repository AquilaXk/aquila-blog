package com.back.global.security.config

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.back.boundedContexts.cloud.config.CloudSecurityConfigurer
import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.security.application.AuthIpSecurityService
import com.back.global.security.application.AuthSecurityEventService
import com.back.global.web.ErrorResponseWriterTestSupport
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.ClientIpResolver
import com.back.global.web.application.Rq
import jakarta.servlet.http.HttpServlet
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.slf4j.LoggerFactory
import org.springframework.http.HttpHeaders
import org.springframework.mock.env.MockEnvironment
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
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
                "com.back.global.security.config.RefreshTokenAuthenticationHandler",
            ).map(Class<*>::forName)

        assertThat(extractedBoundaryTypes.map { it.simpleName })
            .containsExactly(
                "MemberSessionAuthenticationResolver",
                "AccessTokenAuthenticationHandler",
                "ApiKeyAuthorityRefreshHandler",
                "RefreshTokenAuthenticationHandler",
            )
        assertThat(extractedBoundaryTypes)
            .allSatisfy { boundaryType ->
                assertThat(boundaryType.getAnnotation(Component::class.java)).isNotNull()
            }

        val filterConstructorTypes =
            CustomAuthenticationFilter::class.java.constructors
                .single()
                .parameterTypes
                .toList()

        assertThat(filterConstructorTypes)
            .contains(AccessTokenAuthenticationHandler::class.java, RefreshTokenAuthenticationHandler::class.java)
            .doesNotContain(
                ActorApplicationService::class.java,
                MemberSessionUseCase::class.java,
                AuthCookieService::class.java,
                AuthIpSecurityVerifier::class.java,
                SecurityContextAuthenticationWriter::class.java,
                Rq::class.java,
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
            )

        assertThatCode {
            resolver.ensureUsable(MemberSessionResolution(sessionKeyProvided = false, session = null))
        }.doesNotThrowAnyException()

        verify(authCookieService, never()).expireAuthCookies()
    }

    @Test
    @DisplayName("세션 resolver는 safe read에서도 snapshot 누락을 세션 만료로 처리한다")
    fun `session resolver rejects missing snapshot for safe read`() {
        val memberSessionUseCase = mock(MemberSessionUseCase::class.java)
        val authCookieService = mock(AuthCookieService::class.java)
        val resolver =
            MemberSessionAuthenticationResolver(
                memberSessionUseCase = memberSessionUseCase,
                authCookieService = authCookieService,
            )
        val request = MockHttpServletRequest("GET", "/member/api/v1/auth/session\r\n")
        val payload =
            AccessTokenPayload(
                id = 7L,
                sessionKey = "fresh-session-key",
                username = "fresh-user",
                email = "fresh-user@example.com",
                name = "Fresh User",
                rememberLoginEnabled = false,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                issuedAt = Instant.now(),
                expiresAt = Instant.now().plusSeconds(60),
            )

        val resolution =
            resolver.resolve(
                memberId = 7L,
                cookieSessionKey = "fresh-session-key",
                tokenSessionKey = null,
                payload = payload,
                request = request,
            )

        assertThat(resolution.session).isNull()
        assertThat(resolution.sessionKeyProvided).isTrue()
    }

    @Test
    @DisplayName("persisted member가 없으면 transient principal 없이 인증 쿠키를 만료한다")
    fun `missing persisted member expires auth cookies`() {
        val fixture = CustomAuthenticationFilterFixture()
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

        given(fixture.actorApplicationService.payload(accessToken))
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
        given(fixture.memberSessionUseCase.findActiveSessionSnapshot(54L, sessionKey)).willReturn(sessionSnapshot)
        given(fixture.actorApplicationService.findById(54L)).willReturn(null)

        try {
            assertThatThrownBy {
                fixture.accessTokenAuthenticationHandler().authenticate(
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
            }.isInstanceOf(AppException::class.java)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.SESSION_EXPIRED)
            assertThat(SecurityContextHolder.getContext().authentication).isNull()
            verify(fixture.authCookieService).expireAuthCookies()
        } finally {
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    @DisplayName("prod Swagger와 OpenAPI 문서 경로도 쿠키 인증 필터 대상이다")
    fun `prod api docs paths are authentication filter targets`() {
        val fixture = CustomAuthenticationFilterFixture()
        val accessToken = "broken-access-token"
        val filter = fixture.authenticationFilter(profile = "prod")

        fixture.givenEmptyAuthorizationHeader()
        fixture.givenCookieTokens(accessToken = accessToken)
        given(fixture.actorApplicationService.payload(accessToken)).willThrow(RuntimeException("jwt down"))

        listOf(
            "/swagger-ui/index.html",
            "/v3/api-docs",
            "/v3/api-docs/swagger-config",
        ).forEach { path ->
            val request = MockHttpServletRequest("GET", path)
            val response = MockHttpServletResponse()
            val filterChain = fixture.noContentFilterChain()

            fixture.givenProtectedRequest(request)
            fixture.givenClientIp(request, "203.0.113.20")

            filter.doFilter(request, response, filterChain)

            assertThat(response.status).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED)
            assertThat(response.contentAsString).contains("\"resultCode\":\"401-1\"")
        }
    }

    @Test
    @DisplayName("non-prod 공개 문서 경로는 stale 인증 쿠키가 있어도 필터를 건너뛴다")
    fun `non prod public docs paths skip stale auth cookies`() {
        val fixture = CustomAuthenticationFilterFixture()
        val filter = fixture.authenticationFilter()

        listOf(
            "/swagger-ui/index.html",
            "/v3/api-docs",
            "/v3/api-docs/swagger-config",
        ).forEach { path ->
            val request = MockHttpServletRequest("GET", path)
            val response = MockHttpServletResponse()
            val filterChain = fixture.noContentFilterChain()

            filter.doFilter(request, response, filterChain)

            assertThat(response.status).isEqualTo(HttpServletResponse.SC_NO_CONTENT)
        }

        verify(fixture.actorApplicationService, never()).payload("broken-access-token")
    }

    @Test
    @DisplayName("보호 API에서 인증 처리 중 예기치 못한 예외가 발생하면 500 대신 401-1로 응답한다")
    fun `protected api unexpected auth error returns 401`() {
        val fixture = CustomAuthenticationFilterFixture()
        val request = MockHttpServletRequest("GET", "/member/api/v1/notifications/snapshot")
        request.addHeader(HttpHeaders.ORIGIN, "https://blog.aquilaxk.site")

        fixture.givenProtectedRequest(request)
        fixture.givenEmptyAuthorizationHeader()
        fixture.givenCookieTokens(accessToken = "broken-access-token")
        fixture.givenClientIp(request, "203.0.113.10")
        given(fixture.actorApplicationService.payload("broken-access-token")).willThrow(RuntimeException("jwt down"))

        val response = MockHttpServletResponse()
        val filterChain = MockFilterChain()

        fixture.authenticationFilter().doFilter(request, response, filterChain)

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED)
        assertThat(response.contentAsString).contains("\"resultCode\":\"401-1\"")
    }

    @Test
    @DisplayName("공개 API에서 인증 처리 중 예기치 못한 예외가 발생해도 익명으로 요청 처리를 계속한다")
    fun `public api unexpected auth error proceeds as anonymous`() {
        val fixture = CustomAuthenticationFilterFixture()
        val request = MockHttpServletRequest("GET", "/post/api/v1/posts")

        fixture.givenPublicRequest(request)
        fixture.givenEmptyAuthorizationHeader()
        fixture.givenCookieTokens(accessToken = "broken-access-token")
        fixture.givenClientIp(request, "203.0.113.11")
        given(fixture.actorApplicationService.payload("broken-access-token"))
            .willThrow(RuntimeException("auth token=RAW_AUTH_CANARY"))

        val response = MockHttpServletResponse()
        val filterChain = fixture.noContentFilterChain()
        val appender = attachListAppender()

        try {
            fixture.authenticationFilter().doFilter(request, response, filterChain)
        } finally {
            detachListAppender(appender)
        }

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_NO_CONTENT)
        val event = appender.list.single()
        assertThat(event.formattedMessage)
            .contains("authentication_filter_fallback")
            .contains("path=/post/api/v1/posts")
            .contains("publicApi=true")
            .contains("reason=RuntimeException")
            .doesNotContain("RAW_AUTH_CANARY")
        assertThat(event.throwableProxy).isNull()
    }

    @Test
    @DisplayName("외부 cloud content 공개 route는 GET/HEAD stale 인증 정보가 있어도 token 검증 경로로 진행한다")
    fun `cloud external content public route proceeds with stale auth credentials`() {
        listOf("GET", "HEAD").forEach { method ->
            val fixture =
                CustomAuthenticationFilterFixture(
                    publicApiRequestMatcherOverride =
                        PublicApiRequestMatcher(listOf(CloudSecurityConfigurer())),
                )
            val request = MockHttpServletRequest(method, "/system/api/v1/adm/cloud/files/12/external-content")

            fixture.givenEmptyAuthorizationHeader()
            fixture.givenCookieTokens(accessToken = "broken-access-token")
            fixture.givenClientIp(request, "203.0.113.12")
            given(fixture.actorApplicationService.payload("broken-access-token")).willThrow(RuntimeException("jwt down"))

            val response = MockHttpServletResponse()
            val filterChain = fixture.noContentFilterChain()

            fixture.authenticationFilter().doFilter(request, response, filterChain)

            assertThat(response.status).isEqualTo(HttpServletResponse.SC_NO_CONTENT)
        }
    }

    @Test
    @DisplayName("payload email 누락 토큰은 DB 회원 권한으로 인증하지만 accessToken을 재발급하지 않는다")
    fun `email-less token authenticates with persisted authority without reissuing token`() {
        configureProductionUrls()
        val fixture = CustomAuthenticationFilterFixture()
        val request = MockHttpServletRequest("PUT", "/post/api/v1/posts/452")
        val apiKey = "legacy-api-key"
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
        val persistedAdmin = Member(54L, "internal-admin", null, "aquila", "admin@test.com", apiKey)
        persistedAdmin.grantAdmin()

        fixture.givenProtectedRequest(request)
        fixture.givenEmptyAuthorizationHeader()
        fixture.givenCookieTokens(apiKey = apiKey, accessToken = legacyToken, sessionKey = sessionKey)
        given(fixture.actorApplicationService.payload(legacyToken))
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
        given(fixture.memberSessionUseCase.findActiveSessionSnapshot(54L, sessionKey)).willReturn(sessionSnapshot)
        given(fixture.actorApplicationService.findById(54L)).willReturn(persistedAdmin)
        fixture.givenClientIp(request, "203.0.113.12")

        val response = MockHttpServletResponse()
        val filterChain = fixture.adminRoleRequiredFilterChain()

        try {
            fixture.authenticationFilter().doFilter(request, response, filterChain)
            assertThat(response.status).isEqualTo(HttpServletResponse.SC_NO_CONTENT)
            verify(fixture.authCookieService, never()).issueAccessToken(
                ArgumentMatchers.anyString(),
                ArgumentMatchers.anyBoolean(),
                ArgumentMatchers.nullable(String::class.java),
                ArgumentMatchers.nullable(String::class.java),
            )
            verify(fixture.actorApplicationService, never()).findByApiKey(apiKey)
        } finally {
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    @DisplayName("쓰기 요청에서 accessToken payload 권한이 오래된 경우 apiKey 기준 DB 권한으로 재구성한다")
    fun `mutating request prefers apiKey member authority over stale token payload`() {
        configureProductionUrls()
        val fixture = CustomAuthenticationFilterFixture()
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
        persistedAdmin.grantAdmin()

        fixture.givenProtectedRequest(request)
        fixture.givenEmptyAuthorizationHeader()
        fixture.givenCookieTokens(apiKey = apiKey, accessToken = staleAccessToken, sessionKey = sessionKey)
        given(fixture.actorApplicationService.payload(staleAccessToken))
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
        given(fixture.actorApplicationService.findByApiKey(apiKey)).willReturn(persistedAdmin)
        given(fixture.memberSessionUseCase.findActiveSessionSnapshot(54L, sessionKey)).willReturn(sessionSnapshot)
        given(fixture.actorApplicationService.genAccessToken(persistedAdmin, sessionKey, true, false, null))
            .willReturn("rotated-access-token")
        fixture.givenClientIp(request, "203.0.113.13")

        val response = MockHttpServletResponse()
        val filterChain = fixture.adminRoleRequiredFilterChain()

        try {
            fixture.authenticationFilter().doFilter(request, response, filterChain)
            assertThat(response.status).isEqualTo(HttpServletResponse.SC_NO_CONTENT)
        } finally {
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    @DisplayName("정상 accessToken 인증도 DB 회원의 admin flag로 권한을 구성한다")
    fun `normal access token restores admin authority from persisted member`() {
        configureProductionUrls()
        val fixture = CustomAuthenticationFilterFixture()
        val request = MockHttpServletRequest("PUT", "/post/api/v1/posts/452")
        val accessToken = "admin-access-token"
        val sessionKey = "admin-session-key"
        val sessionSnapshot =
            MemberSessionAuthSnapshot(
                id = 12L,
                memberId = 54L,
                sessionKey = sessionKey,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                lastAuthenticatedAt = Instant.now(),
            )
        val persistedAdmin = Member(54L, "internal-admin", null, "aquila", "admin@test.com")
        persistedAdmin.grantAdmin()

        fixture.givenProtectedRequest(request)
        fixture.givenBearerAccessToken(accessToken, sessionKey)
        given(fixture.actorApplicationService.payload(accessToken))
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
                ),
            )
        given(fixture.memberSessionUseCase.findActiveSessionSnapshot(54L, sessionKey)).willReturn(sessionSnapshot)
        given(fixture.actorApplicationService.findById(54L)).willReturn(persistedAdmin)
        fixture.givenClientIp(request, "203.0.113.16")

        val response = MockHttpServletResponse()
        val filterChain = fixture.adminRoleRequiredFilterChain()

        try {
            fixture.authenticationFilter().doFilter(request, response, filterChain)
            assertThat(response.status).isEqualTo(HttpServletResponse.SC_NO_CONTENT)
            verify(fixture.memberSessionUseCase).touchAuthenticated(sessionSnapshot)
            verify(fixture.authCookieService, never()).issueAccessToken(
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
    @DisplayName("safe read 요청도 세션 snapshot이 없으면 인증 쿠키를 만료하고 401-8로 닫는다")
    fun `missing snapshot rejects safe read request`() {
        val fixture = CustomAuthenticationFilterFixture()
        val request = MockHttpServletRequest("GET", "/member/api/v1/auth/session")
        val accessToken = "fresh-access-token"
        val sessionKey = "fresh-session-key"

        fixture.givenProtectedRequest(request)
        fixture.givenBearerAccessToken(accessToken, sessionKey)
        fixture.givenClientIp(request, "203.0.113.14")
        given(fixture.actorApplicationService.payload(accessToken))
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
        given(fixture.memberSessionUseCase.findActiveSessionSnapshot(54L, sessionKey)).willReturn(null)

        val response = MockHttpServletResponse()
        val filterChain = fixture.noContentFilterChain()

        try {
            fixture.authenticationFilter().doFilter(request, response, filterChain)
            assertThat(response.status).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED)
            assertThat(response.contentAsString).contains("\"resultCode\":\"401-8\"")
            verify(fixture.authCookieService).expireAuthCookies()
        } finally {
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    @DisplayName("세션 snapshot이 있어도 삭제된 계정은 인증 쿠키를 만료한다")
    fun `missing persisted member rejects authenticated session`() {
        val fixture = CustomAuthenticationFilterFixture()
        val request = MockHttpServletRequest("GET", "/member/api/v1/auth/session")
        val accessToken = "fresh-deleted-access-token"
        val sessionKey = "fresh-deleted-session-key"

        fixture.givenProtectedRequest(request)
        fixture.givenBearerAccessToken(accessToken, sessionKey)
        fixture.givenClientIp(request, "203.0.113.17")
        given(fixture.actorApplicationService.payload(accessToken))
            .willReturn(
                AccessTokenPayload(
                    id = 54L,
                    sessionKey = sessionKey,
                    username = "deleted-54",
                    email = null,
                    name = "탈퇴한 사용자",
                    rememberLoginEnabled = true,
                    ipSecurityEnabled = false,
                    ipSecurityFingerprint = null,
                    issuedAt = Instant.now(),
                ),
            )
        given(fixture.memberSessionUseCase.findActiveSessionSnapshot(54L, sessionKey))
            .willReturn(
                MemberSessionAuthSnapshot(11L, 54L, sessionKey, true, false, null, Instant.now()),
            )
        given(fixture.actorApplicationService.findById(54L)).willReturn(null)

        val response = MockHttpServletResponse()
        val filterChain = MockFilterChain()

        try {
            fixture.authenticationFilter().doFilter(request, response, filterChain)
            assertThat(response.status).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED)
            assertThat(response.contentAsString).contains("\"resultCode\":\"401-8\"")
            verify(fixture.authCookieService).expireAuthCookies()
        } finally {
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    @DisplayName("쓰기 요청도 세션 snapshot이 없으면 인증 쿠키를 만료한다")
    fun `missing snapshot rejects mutating request`() {
        val fixture = CustomAuthenticationFilterFixture()
        val request = MockHttpServletRequest("POST", "/member/api/v1/auth/me")
        val accessToken = "fresh-access-token"
        val sessionKey = "fresh-session-key"

        fixture.givenProtectedRequest(request)
        fixture.givenBearerAccessToken(accessToken, sessionKey)
        fixture.givenClientIp(request, "203.0.113.15")
        given(fixture.actorApplicationService.payload(accessToken))
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
        given(fixture.memberSessionUseCase.findActiveSessionSnapshot(54L, sessionKey)).willReturn(null)

        val response = MockHttpServletResponse()
        val filterChain = MockFilterChain()

        try {
            fixture.authenticationFilter().doFilter(request, response, filterChain)
            assertThat(response.status).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED)
            assertThat(response.contentAsString).contains("\"resultCode\":\"401-8\"")
            verify(fixture.authCookieService).expireAuthCookies()
        } finally {
            SecurityContextHolder.clearContext()
        }
    }

    private fun configureProductionUrls() {
        AppConfig(
            siteBackUrl = "https://api.blog.aquilaxk.site",
            siteFrontUrl = "https://blog.aquilaxk.site",
        )
    }

    private fun attachListAppender(): ListAppender<ILoggingEvent> {
        val logger = LoggerFactory.getLogger(CustomAuthenticationFilter::class.java) as Logger
        return ListAppender<ILoggingEvent>().also {
            it.start()
            logger.addAppender(it)
        }
    }

    private fun detachListAppender(appender: ListAppender<ILoggingEvent>) {
        val logger = LoggerFactory.getLogger(CustomAuthenticationFilter::class.java) as Logger
        logger.detachAppender(appender)
        appender.stop()
    }

    private class CustomAuthenticationFilterFixture(
        publicApiRequestMatcherOverride: PublicApiRequestMatcher? = null,
    ) {
        val actorApplicationService: ActorApplicationService = mock(ActorApplicationService::class.java)
        val memberSessionUseCase: MemberSessionUseCase = mock(MemberSessionUseCase::class.java)
        val authIpSecurityService: AuthIpSecurityService = mock(AuthIpSecurityService::class.java)
        val authSecurityEventService: AuthSecurityEventService = mock(AuthSecurityEventService::class.java)
        val authCookieService: AuthCookieService = mock(AuthCookieService::class.java)
        val clientIpResolver: ClientIpResolver = mock(ClientIpResolver::class.java)
        val publicApiRequestMatcher: PublicApiRequestMatcher =
            publicApiRequestMatcherOverride ?: mock(PublicApiRequestMatcher::class.java)
        val apiCorsPolicy: ApiCorsPolicy = mock(ApiCorsPolicy::class.java)
        val rq: Rq = mock(Rq::class.java)

        private val memberSessionAuthenticationResolver =
            MemberSessionAuthenticationResolver(
                memberSessionUseCase = memberSessionUseCase,
                authCookieService = authCookieService,
            )
        private val authIpSecurityVerifier =
            AuthIpSecurityVerifier(
                authIpSecurityService,
                authSecurityEventService,
                authCookieService,
                memberSessionUseCase,
            )
        private val securityContextAuthenticationWriter = SecurityContextAuthenticationWriter()
        private val apiKeyAuthorityRefreshHandler =
            ApiKeyAuthorityRefreshHandler(
                actorApplicationService = actorApplicationService,
                memberSessionUseCase = memberSessionUseCase,
                authCookieService = authCookieService,
                authIpSecurityVerifier = authIpSecurityVerifier,
                securityContextAuthenticationWriter = securityContextAuthenticationWriter,
                memberSessionAuthenticationResolver = memberSessionAuthenticationResolver,
                rq = rq,
            )
        private val accessTokenAuthenticationHandler =
            AccessTokenAuthenticationHandler(
                actorApplicationService = actorApplicationService,
                memberSessionUseCase = memberSessionUseCase,
                authIpSecurityVerifier = authIpSecurityVerifier,
                securityContextAuthenticationWriter = securityContextAuthenticationWriter,
                memberSessionAuthenticationResolver = memberSessionAuthenticationResolver,
                apiKeyAuthorityRefreshHandler = apiKeyAuthorityRefreshHandler,
            )
        private val refreshTokenAuthenticationHandler =
            RefreshTokenAuthenticationHandler(
                actorApplicationService = actorApplicationService,
                memberSessionUseCase = memberSessionUseCase,
                authCookieService = authCookieService,
                authIpSecurityVerifier = authIpSecurityVerifier,
                securityContextAuthenticationWriter = securityContextAuthenticationWriter,
                rq = rq,
            )

        fun authenticationFilter(profile: String = "test"): CustomAuthenticationFilter =
            CustomAuthenticationFilter(
                authTokenExtractor = AuthTokenExtractor(rq),
                accessTokenAuthenticationHandler = accessTokenAuthenticationHandler,
                refreshTokenAuthenticationHandler = refreshTokenAuthenticationHandler,
                clientIpResolver = clientIpResolver,
                errorResponseWriter = ErrorResponseWriterTestSupport.createWriter(),
                publicApiRequestMatcher = publicApiRequestMatcher,
                apiCorsPolicy = apiCorsPolicy,
                environment = MockEnvironment().apply { setActiveProfiles(profile) },
            )

        fun accessTokenAuthenticationHandler(): AccessTokenAuthenticationHandler = accessTokenAuthenticationHandler

        fun givenEmptyAuthorizationHeader() {
            given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("")
        }

        fun givenBearerAccessToken(
            accessToken: String,
            sessionKey: String,
        ) {
            given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("Bearer $accessToken")
            given(rq.getCookieValue(AuthCookieNames.SESSION_KEY, "")).willReturn(sessionKey)
        }

        fun givenCookieTokens(
            apiKey: String = "",
            accessToken: String = "",
            sessionKey: String = "",
            refreshToken: String = "",
        ) {
            given(rq.getCookieValue(AuthCookieNames.API_KEY, "")).willReturn(apiKey)
            given(rq.getCookieValue(AuthCookieNames.ACCESS_TOKEN, "")).willReturn(accessToken)
            given(rq.getCookieValue(AuthCookieNames.SESSION_KEY, "")).willReturn(sessionKey)
            given(rq.getCookieValue(AuthCookieNames.REFRESH_TOKEN, "")).willReturn(refreshToken)
        }

        fun givenProtectedRequest(request: HttpServletRequest) {
            given(publicApiRequestMatcher.matches(request)).willReturn(false)
        }

        fun givenPublicRequest(request: HttpServletRequest) {
            given(publicApiRequestMatcher.matches(request)).willReturn(true)
        }

        fun givenClientIp(
            request: HttpServletRequest,
            clientIp: String,
        ) {
            given(clientIpResolver.resolve(request)).willReturn(clientIp)
        }

        fun noContentFilterChain(): MockFilterChain = MockFilterChain(NoContentServlet())

        fun adminRoleRequiredFilterChain(): MockFilterChain = MockFilterChain(AdminRoleRequiredServlet())
    }

    private class NoContentServlet : HttpServlet() {
        override fun service(
            req: HttpServletRequest,
            res: HttpServletResponse,
        ) {
            res.status = HttpServletResponse.SC_NO_CONTENT
        }
    }

    private class AdminRoleRequiredServlet : HttpServlet() {
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
    }
}
