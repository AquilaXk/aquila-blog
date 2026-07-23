package com.back.boundedContexts.member.subContexts.oauthSignup.application.service

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("OAuthSignupHashService 테스트")
class OAuthSignupHashServiceTest {
    @Test
    fun `pending token과 provider subject는 목적별 HMAC으로 변환한다`() {
        val service = OAuthSignupHashService("oauth-secret", "signup-secret", "jwt-secret")

        val tokenHash = service.pendingTokenHash(" pending-token ")
        val subjectHash = service.providerSubjectHash(" kakao ", " provider-subject ")

        assertThat(tokenHash).isEqualTo(service.pendingTokenHash("pending-token"))
        assertThat(subjectHash).isEqualTo(service.providerSubjectHash("KAKAO", "provider-subject"))
        assertThat(tokenHash).isNotEqualTo(subjectHash)
        assertThat(tokenHash).doesNotContain("pending-token")
        assertThat(subjectHash).doesNotContain("provider-subject")
    }

    @Test
    fun `member login id는 정규화 provider와 hash prefix로 만든다`() {
        val service = OAuthSignupHashService("oauth-secret", "signup-secret", "jwt-secret")
        val providerSubjectHash = "a".repeat(80)

        val loginId = service.memberLoginId(" kakao ", providerSubjectHash)

        assertThat(loginId).isEqualTo("KAKAO__${"a".repeat(43)}")
    }

    @Test
    fun `전용 secret이 비어 있으면 signup secret과 jwt secret 순서로 fallback한다`() {
        val signupFallback = OAuthSignupHashService("", "signup-secret", "jwt-secret")
        val jwtFallback = OAuthSignupHashService("", "", "jwt-secret")

        assertThat(signupFallback.pendingTokenHash("token"))
            .isNotBlank()
        assertThat(jwtFallback.pendingTokenHash("token"))
            .isNotBlank()
        assertThat(signupFallback.pendingTokenHash("token"))
            .isNotEqualTo(jwtFallback.pendingTokenHash("token"))
    }

    @Test
    fun `blank 입력과 secret은 거부한다`() {
        val service = OAuthSignupHashService("oauth-secret", "signup-secret", "jwt-secret")

        assertThatThrownBy { service.pendingTokenHash(" ") }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("oauth-signup-pending-token")
        assertThatThrownBy { service.providerSubjectHash(" ", "subject") }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("oauth provider")
        assertThatThrownBy { service.providerSubjectHash("KAKAO", " ") }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("oauth provider subject")
        assertThatThrownBy { service.memberLoginId("KAKAO", " ") }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("oauth provider subject hash")
        assertThatThrownBy { OAuthSignupHashService("", "", "").pendingTokenHash("token") }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("custom.member.oauthSignup.tokenHashSecret")
    }
}
