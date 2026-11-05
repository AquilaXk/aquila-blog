package com.back.global.security.config

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionWithRefreshToken
import jakarta.servlet.http.HttpServlet
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.springframework.http.HttpHeaders
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.core.context.SecurityContextHolder

@DisplayName("CustomAuthenticationFilter 및 경로 정규화 하드닝 테스트")
class CustomAuthenticationFilterHardeningTest {
    @Test
    @DisplayName("refreshToken 회전 성공 시 응답에 private no-store Cache-Control 헤더를 즉시 설정한다")
    fun `refresh token rotation sets private no store cache control header`() {
        val fixture = CustomAuthenticationFilterTest.CustomAuthenticationFilterFixture()
        val request = MockHttpServletRequest("GET", "/member/api/v1/auth/session")
        val sessionKey = "admin-session-key"
        val refreshToken = "valid-refresh-token"
        val admin = Member(54L, "internal-admin", null, "aquila", "admin@test.com").also { it.grantAdmin() }
        val memberSession = MemberSession(id = 10L, member = admin, sessionKey = sessionKey)
        given(fixture.memberSessionUseCase.rotateRefreshToken(sessionKey, refreshToken))
            .willReturn(MemberSessionWithRefreshToken(memberSession, "rotated-refresh-token"))
        given(fixture.actorApplicationService.findById(admin.id)).willReturn(admin)
        given(fixture.actorApplicationService.genAccessToken(admin, sessionKey, true, false, null))
            .willReturn("new-access-token")

        try {
            fixture.refreshTokenAuthenticationHandler().authenticate(
                request = request,
                tokens = ExtractedAuthTokens("api-key", "", sessionKey, refreshToken),
                clientIp = "203.0.113.10",
            )

            verify(fixture.rq).setHeader(HttpHeaders.AUTHORIZATION, "Bearer new-access-token")
            verify(fixture.rq).setHeader(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0")
        } finally {
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    @DisplayName("공개 GET/HEAD 요청은 만료된 accessToken에서 refreshToken 회전을 건너뛰어 CDN 토큰 유출을 원천 차단한다")
    fun `public read safe get and head skip refresh token rotation`() {
        val fixture = CustomAuthenticationFilterTest.CustomAuthenticationFilterFixture()
        val filter = fixture.authenticationFilter()
        fixture.givenEmptyAuthorizationHeader()
        fixture.givenCookieTokens(sessionKey = "admin-session", refreshToken = "valid-refresh-token")

        for (method in listOf("GET", "HEAD")) {
            val request = MockHttpServletRequest(method, "/post/api/v1/posts")
            val response = MockHttpServletResponse()
            fixture.givenPublicRequest(request)
            fixture.givenClientIp(request, "203.0.113.10")

            filter.doFilter(request, response, MockFilterChain())

            assertThat(response.status).isEqualTo(HttpServletResponse.SC_OK)
        }

        verify(fixture.memberSessionUseCase, never()).rotateRefreshToken("admin-session", "valid-refresh-token")
    }

    @Test
    @DisplayName("ApiDefaultCacheControlFilter는 Set-Cookie 또는 Authorization 헤더가 있으면 기존 public Cache-Control도 private no-store로 강제 강등한다")
    fun `api default cache control filter downgrades public cache when set cookie or authorization is present`() {
        val filter = ApiDefaultCacheControlFilter()
        val request = MockHttpServletRequest("GET", "/post/api/v1/images/2026/04/test.png")
        val response = MockHttpServletResponse()
        val publicCacheServlet =
            object : HttpServlet() {
                override fun service(
                    req: HttpServletRequest,
                    res: HttpServletResponse,
                ) {
                    res.setHeader(HttpHeaders.CACHE_CONTROL, "public, max-age=3600")
                    res.addHeader(HttpHeaders.SET_COOKIE, "accessToken=; Max-Age=0")
                }
            }

        filter.doFilter(request, response, MockFilterChain(publicCacheServlet))

        assertThat(response.getHeader(HttpHeaders.CACHE_CONTROL))
            .isEqualTo("private, no-store, max-age=0, must-revalidate")
    }

    @Test
    @DisplayName("인코딩되거나 중복 슬래시 및 매트릭스 파라미터 우회가 포함된 보호 API 경로도 인증 필터를 우회하지 못한다")
    fun `encoded or duplicate slash or matrix parameter protected paths do not bypass authentication filter`() {
        val fixture = CustomAuthenticationFilterTest.CustomAuthenticationFilterFixture()
        val filter = fixture.authenticationFilter()
        fixture.givenEmptyAuthorizationHeader()
        fixture.givenCookieTokens(accessToken = "broken-access-token")
        given(fixture.actorApplicationService.payload("broken-access-token")).willThrow(RuntimeException("jwt down"))

        for (rawPath in listOf(
            "/member/%61pi/v1/privacy/export",
            "/member/%2561pi/v1/privacy/export",
            "//member//api/v1/privacy/export",
            "/member/api/v1/privacy/export;jsessionid=123",
            "/member/api/v1/privacy/export;a=%5c..%5c..%5cactuator%5chealth",
        )) {
            val request = MockHttpServletRequest("GET", rawPath)
            val response = MockHttpServletResponse()
            fixture.givenProtectedRequest(request)
            fixture.givenClientIp(request, "203.0.113.10")

            filter.doFilter(request, response, MockFilterChain())

            assertThat(response.status).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED)
            assertThat(response.contentAsString).contains("\"resultCode\":\"401-1\"")
        }
    }

    @Test
    @DisplayName("RequestPathNormalizer는 매트릭스 파라미터 내 백슬래시 주입, 다중 디코딩, 널 바이트, 컨텍스트 경로, 상대 경로를 정규화한다")
    fun `request path normalizer handles matrix backslash injection multi pass decoding and edge cases`() {
        assertThat(
            RequestPathNormalizer.normalizePath("/post/api/v1/posts/1/hit;a=%5c..%5c..%5cactuator%5chealth"),
        ).isEqualTo("/post/api/v1/posts/1/hit")
        assertThat(
            RequestPathNormalizer.normalizePath("/post/api/v1/posts/1/hit%3ba=%255c..%255cactuator%255chealth"),
        ).isEqualTo("/post/api/v1/posts/1/hit")
        assertThat(
            RequestPathNormalizer.normalizePath("/app/member/%2541pi/%00/%2e/v1/a/../b/?x=1", "/app"),
        ).isEqualTo("/member/Api/?/v1/b/")
        assertThat(RequestPathNormalizer.normalizePath("/../../", null)).isEqualTo("/")
        assertThat(RequestPathNormalizer.normalizePath("", null)).isEqualTo("/")
        assertThat(RequestPathNormalizer.normalizePath("/%GG/%1", null)).isEqualTo("/%GG/%1")
        assertThat(RequestPathNormalizer.normalizePath("/%252561", null)).isEqualTo("/a")

        val servletPathFallbackRequest =
            MockHttpServletRequest("GET", "").apply {
                servletPath = "/post/api/v1/posts"
            }
        assertThat(RequestPathNormalizer.normalize(servletPathFallbackRequest)).isEqualTo("/post/api/v1/posts")
    }

    @Test
    @DisplayName("쿼리 스트링이나 파라미터 맵에 인증 토큰 키가 포함되면 공개·보호 API 모두 400-1로 즉시 차단한다")
    fun `query string or parameter map auth credentials are rejected with 400 before authentication`() {
        val fixture = CustomAuthenticationFilterTest.CustomAuthenticationFilterFixture()
        val filter = fixture.authenticationFilter()

        val forbiddenQueryCases =
            listOf(
                "accessToken=leaked-jwt",
                "access_token=leaked-jwt",
                "ACCESS-TOKEN=leaked-jwt",
                "refreshToken=leaked-refresh",
                "refresh_token=leaked-refresh",
                "sessionKey=leaked-session",
                "session-key=leaked-session",
                "apiKey=leaked-api-key",
                "api%5Fkey=leaked-api-key",
                "accessToken%3Dleaked-jwt",
                "accessToken%3Dleaked-jwt%GG",
                "%2561ccessToken=leaked-jwt",
                "%252561ccessToken=leaked-jwt",
                "a=1%26refreshToken%3Dleaked-refresh",
                "bad=%GG&accessToken%3Dleaked-jwt",
                "bad=%GG%26accessToken=leaked-jwt",
                "page=1;refresh_token=leaked-refresh",
            )

        for (rawQuery in forbiddenQueryCases) {
            val request =
                MockHttpServletRequest("GET", "/post/api/v1/posts").apply {
                    queryString = rawQuery
                }
            val response = MockHttpServletResponse()
            fixture.givenPublicRequest(request)

            filter.doFilter(request, response, fixture.noContentFilterChain())

            assertThat(response.status).isEqualTo(HttpServletResponse.SC_BAD_REQUEST)
            assertThat(response.contentAsString).contains("\"resultCode\":\"400-1\"")
        }

        for (paramKey in listOf("  Session_Key ", "api%5Fkey", "%61ccessToken", "accessToken%3Dleaked")) {
            val parameterMapOnlyRequest =
                MockHttpServletRequest("POST", "/member/api/v1/auth/logout").apply {
                    addParameter(paramKey, "leaked-session")
                }
            val parameterMapResponse = MockHttpServletResponse()
            fixture.givenProtectedRequest(parameterMapOnlyRequest)

            filter.doFilter(parameterMapOnlyRequest, parameterMapResponse, fixture.noContentFilterChain())

            assertThat(parameterMapResponse.status).isEqualTo(HttpServletResponse.SC_BAD_REQUEST)
            assertThat(parameterMapResponse.contentAsString).contains("\"resultCode\":\"400-1\"")
            verify(fixture.clientIpResolver, never()).resolve(parameterMapOnlyRequest)
        }
    }

    @Test
    @DisplayName("POST form/multipart 및 본문이 있는 요청은 인증 전 getParameterMap을 호출하거나 차단하지 않는다")
    fun `post form and multipart requests do not parse parameter map before authentication`() {
        val fixture = CustomAuthenticationFilterTest.CustomAuthenticationFilterFixture()
        val filter = fixture.authenticationFilter()
        fixture.givenEmptyAuthorizationHeader()
        fixture.givenCookieTokens()

        val bodyRequests =
            listOf(
                object : MockHttpServletRequest("POST", "/post/api/v1/posts") {
                    var parameterMapCalls = 0

                    override fun getParameterMap(): MutableMap<String, Array<String>> {
                        parameterMapCalls++
                        return super.getParameterMap()
                    }
                }.apply {
                    contentType = "multipart/form-data; boundary=---test"
                    setParameter("apiKey", "form-field-value")
                },
                object : MockHttpServletRequest("POST", "/post/api/v1/posts") {
                    var parameterMapCalls = 0

                    override fun getParameterMap(): MutableMap<String, Array<String>> {
                        parameterMapCalls++
                        return super.getParameterMap()
                    }
                }.apply {
                    contentType = "application/x-www-form-urlencoded; charset=UTF-8"
                    setParameter("accessToken", "form-field-value")
                },
                object : MockHttpServletRequest("POST", "/post/api/v1/posts") {
                    var parameterMapCalls = 0

                    override fun getParameterMap(): MutableMap<String, Array<String>> {
                        parameterMapCalls++
                        return super.getParameterMap()
                    }
                }.apply {
                    setContent("{\"apiKey\":\"json-body\"}".toByteArray())
                    setParameter("apiKey", "body-param")
                },
            )

        for (request in bodyRequests) {
            val response = MockHttpServletResponse()
            fixture.givenPublicRequest(request)
            fixture.givenClientIp(request, "203.0.113.10")

            filter.doFilter(request, response, fixture.noContentFilterChain())

            assertThat(response.status).isEqualTo(HttpServletResponse.SC_NO_CONTENT)
            val calls = request.javaClass.getMethod("getParameterMapCalls").invoke(request) as Int
            assertThat(calls).isZero()
        }
    }

    @Test
    @DisplayName("일반 쿼리 파라미터와 미디어 재생용 token 파라미터 및 깨진 퍼센트 인코딩 키는 차단하지 않는다")
    fun `benign query parameters and playback token parameter are allowed`() {
        val fixture = CustomAuthenticationFilterTest.CustomAuthenticationFilterFixture()
        val filter = fixture.authenticationFilter()
        fixture.givenEmptyAuthorizationHeader()
        fixture.givenCookieTokens()

        val request =
            MockHttpServletRequest("GET", "/system/api/v1/public/cloud/files/12/playback").apply {
                queryString = "token=signed-playback-token&%GG=1&page=1"
                setParameter("token", "signed-playback-token")
            }
        val response = MockHttpServletResponse()
        fixture.givenPublicRequest(request)
        fixture.givenClientIp(request, "203.0.113.10")

        filter.doFilter(request, response, fixture.noContentFilterChain())

        assertThat(response.status).isEqualTo(HttpServletResponse.SC_NO_CONTENT)
    }
}
