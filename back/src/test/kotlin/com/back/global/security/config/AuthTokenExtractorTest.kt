package com.back.global.security.config

import com.back.global.exception.application.AppException
import com.back.global.web.application.Rq
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.springframework.http.HttpHeaders

@DisplayName("AuthTokenExtractor 테스트")
class AuthTokenExtractorTest {
    @Test
    @DisplayName("인증 쿠키 이름은 AuthCookieNames 상수로 한 곳에서 관리한다")
    fun authCookieNamesAreCentralized() {
        assertThat(AuthCookieNames.API_KEY).isEqualTo("apiKey")
        assertThat(AuthCookieNames.ACCESS_TOKEN).isEqualTo("accessToken")
        assertThat(AuthCookieNames.REFRESH_TOKEN).isEqualTo("refreshToken")
        assertThat(AuthCookieNames.SESSION_KEY).isEqualTo("sessionKey")
        assertThat(AuthCookieNames.AUTHENTICATION_COOKIE_NAMES)
            .containsExactlyInAnyOrder("apiKey", "accessToken", "refreshToken", "sessionKey")
        assertThat(AuthCookieNames.MUTATION_CSRF_GUARD_COOKIE_NAMES)
            .containsExactlyInAnyOrder("apiKey", "accessToken", "sessionKey")
    }

    @Test
    @DisplayName("Authorization Bearer accessToken만 있으면 apiKey 없이 accessToken을 추출한다")
    fun extractBearerAccessTokenOnly() {
        // given
        val rq = mock(Rq::class.java)
        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("Bearer access-token")
        given(rq.getCookieValue(AuthCookieNames.SESSION_KEY, "")).willReturn("session-key")
        given(rq.getCookieValue(AuthCookieNames.REFRESH_TOKEN, "")).willReturn("refresh-token")
        val extractor = AuthTokenExtractor(rq)

        // when
        val tokens = extractor.extract()

        // then
        assertThat(tokens)
            .isEqualTo(
                ExtractedAuthTokens(
                    apiKey = "",
                    accessToken = "access-token",
                    sessionKey = "session-key",
                    refreshToken = "refresh-token",
                ),
            )
    }

    @Test
    @DisplayName("Authorization Bearer apiKey accessToken 형식이면 두 토큰을 모두 추출한다")
    fun extractBearerApiKeyAndAccessToken() {
        // given
        val rq = mock(Rq::class.java)
        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("Bearer api-key access-token")
        given(rq.getCookieValue(AuthCookieNames.SESSION_KEY, "")).willReturn("session-key")
        given(rq.getCookieValue(AuthCookieNames.REFRESH_TOKEN, "")).willReturn("refresh-token")
        val extractor = AuthTokenExtractor(rq)

        // when
        val tokens = extractor.extract()

        // then
        assertThat(tokens.apiKey).isEqualTo("api-key")
        assertThat(tokens.accessToken).isEqualTo("access-token")
        assertThat(tokens.sessionKey).isEqualTo("session-key")
        assertThat(tokens.refreshToken).isEqualTo("refresh-token")
    }

    @Test
    @DisplayName("Authorization 헤더가 없으면 인증 쿠키에서 토큰을 추출한다")
    fun extractCookieTokensWhenAuthorizationHeaderIsBlank() {
        // given
        val rq = mock(Rq::class.java)
        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("")
        given(rq.getCookieValue(AuthCookieNames.API_KEY, "")).willReturn("cookie-api-key")
        given(rq.getCookieValue(AuthCookieNames.ACCESS_TOKEN, "")).willReturn("cookie-access-token")
        given(rq.getCookieValue(AuthCookieNames.SESSION_KEY, "")).willReturn("cookie-session-key")
        given(rq.getCookieValue(AuthCookieNames.REFRESH_TOKEN, "")).willReturn("cookie-refresh-token")
        val extractor = AuthTokenExtractor(rq)

        // when
        val tokens = extractor.extract()

        // then
        assertThat(tokens)
            .isEqualTo(
                ExtractedAuthTokens(
                    apiKey = "cookie-api-key",
                    accessToken = "cookie-access-token",
                    sessionKey = "cookie-session-key",
                    refreshToken = "cookie-refresh-token",
                ),
            )
    }

    @Test
    @DisplayName("Authorization 헤더가 Bearer 형식이 아니면 401-2로 거절한다")
    fun rejectNonBearerAuthorizationHeader() {
        // given
        val rq = mock(Rq::class.java)
        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("Basic abc")
        given(rq.getCookieValue(AuthCookieNames.SESSION_KEY, "")).willReturn("")
        given(rq.getCookieValue(AuthCookieNames.REFRESH_TOKEN, "")).willReturn("")
        val extractor = AuthTokenExtractor(rq)

        // when / then
        val exception = assertThrows<AppException> { extractor.extract() }

        assertThat(exception.rsData.resultCode).isEqualTo("401-2")
    }

    @Test
    @DisplayName("Authorization Bearer 토큰 수가 허용 형식을 초과하면 401-2로 거절한다")
    fun rejectBearerAuthorizationHeaderWithTooManyTokens() {
        // given
        val rq = mock(Rq::class.java)
        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("Bearer api-key access-token extra-token")
        given(rq.getCookieValue(AuthCookieNames.SESSION_KEY, "")).willReturn("")
        given(rq.getCookieValue(AuthCookieNames.REFRESH_TOKEN, "")).willReturn("")
        val extractor = AuthTokenExtractor(rq)

        // when / then
        val exception = assertThrows<AppException> { extractor.extract() }

        assertThat(exception.rsData.resultCode).isEqualTo("401-2")
    }
}
