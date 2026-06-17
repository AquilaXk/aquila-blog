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
    @DisplayName("Authorization Bearer accessToken만 있으면 apiKey 없이 accessToken을 추출한다")
    fun extractBearerAccessTokenOnly() {
        // given
        val rq = mock(Rq::class.java)
        given(rq.getHeader(HttpHeaders.AUTHORIZATION, "")).willReturn("Bearer access-token")
        given(rq.getCookieValue("sessionKey", "")).willReturn("session-key")
        given(rq.getCookieValue("refreshToken", "")).willReturn("refresh-token")
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
        given(rq.getCookieValue("sessionKey", "")).willReturn("session-key")
        given(rq.getCookieValue("refreshToken", "")).willReturn("refresh-token")
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
        given(rq.getCookieValue("apiKey", "")).willReturn("cookie-api-key")
        given(rq.getCookieValue("accessToken", "")).willReturn("cookie-access-token")
        given(rq.getCookieValue("sessionKey", "")).willReturn("cookie-session-key")
        given(rq.getCookieValue("refreshToken", "")).willReturn("cookie-refresh-token")
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
        given(rq.getCookieValue("sessionKey", "")).willReturn("")
        given(rq.getCookieValue("refreshToken", "")).willReturn("")
        val extractor = AuthTokenExtractor(rq)

        // when / then
        val exception = assertThrows<AppException> { extractor.extract() }

        assertThat(exception.rsData.resultCode).isEqualTo("401-2")
    }
}
