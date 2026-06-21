package com.back.global.security.config.oauth2

import com.back.global.exception.application.AppException
import com.back.global.security.config.oauth2.application.OAuth2State
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.authentication.InternalAuthenticationServiceException
import org.springframework.security.core.AuthenticationException

@org.junit.jupiter.api.DisplayName("CustomOAuth2LoginFailureHandler 테스트")
class CustomOAuth2LoginFailureHandlerTest {
    @Test
    fun `신규 OAuth 가입 차단 실패는 로그인 화면에 signup-required 코드와 next를 전달한다`() {
        val handler = CustomOAuth2LoginFailureHandler("https://www.aquilaxk.site")
        val request =
            MockHttpServletRequest("GET", "/login/oauth2/code/kakao").apply {
                setParameter("state", OAuth2State("/posts/1?tab=comments", "state-id").encode())
            }
        val response = MockHttpServletResponse()

        handler.onAuthenticationFailure(
            request,
            response,
            InternalAuthenticationServiceException(
                "oauth user service failed",
                AppException("403-4", "소셜 로그인 신규 가입은 현재 지원하지 않습니다."),
            ),
        )

        assertThat(response.status).isEqualTo(302)
        assertThat(response.redirectedUrl)
            .isEqualTo("https://www.aquilaxk.site/login?oauthError=signup-required&next=%2Fposts%2F1%3Ftab%3Dcomments")
    }

    @Test
    fun `일반 OAuth 실패는 fallback login URL에 oauth-failed 코드를 전달한다`() {
        val handler = CustomOAuth2LoginFailureHandler("https://www.aquilaxk.site")
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/kakao")
        val response = MockHttpServletResponse()

        handler.onAuthenticationFailure(
            request,
            response,
            object : AuthenticationException("oauth failed") {},
        )

        assertThat(response.status).isEqualTo(302)
        assertThat(response.redirectedUrl).isEqualTo("https://www.aquilaxk.site/login?oauthError=oauth-failed")
    }
}
