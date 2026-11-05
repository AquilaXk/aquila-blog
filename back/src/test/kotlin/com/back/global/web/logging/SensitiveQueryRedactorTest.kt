package com.back.global.web.logging

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("SensitiveQueryRedactor 테스트")
class SensitiveQueryRedactorTest {
    @Test
    @DisplayName("민감 query key의 value만 마스킹하고 비민감 key는 유지한다")
    fun `redacts sensitive query values`() {
        val redacted =
            SensitiveQueryRedactor.redactQuery(
                "code=LEAK_TEST_123&state=STATE_123&email=test@example.com&page=2&apiKey=API_SECRET&kw=private",
            )

        assertThat(redacted)
            .contains("code=[REDACTED]")
            .contains("state=[REDACTED]")
            .contains("email=[REDACTED]")
            .contains("apiKey=[REDACTED]")
            .contains("kw=[REDACTED]")
            .contains("page=2")
            .doesNotContain("LEAK_TEST_123")
            .doesNotContain("STATE_123")
            .doesNotContain("test@example.com")
            .doesNotContain("API_SECRET")
            .doesNotContain("private")
    }

    @Test
    @DisplayName("camelCase/snake_case 토큰 key와 control character를 함께 처리한다")
    fun `redacts token-like key variants and control characters`() {
        val redacted =
            SensitiveQueryRedactor.redactQuery(
                "access_token=LEAK_TEST_123;refreshToken=REFRESH_SECRET&name=ok\r\nnext",
            )

        assertThat(redacted)
            .contains("access_token=[REDACTED]")
            .contains("refreshToken=[REDACTED]")
            .contains("access_token=[REDACTED]&refreshToken=[REDACTED]")
            .contains("name=ok  next")
            .doesNotContain("LEAK_TEST_123")
            .doesNotContain("REFRESH_SECRET")
    }

    @Test
    @DisplayName("exception message 안의 query token도 마스킹한다")
    fun `redacts sensitive query tokens inside text`() {
        val redacted =
            SensitiveQueryRedactor.redactText(
                "failed url=/login/oauth2/code/kakao?code=LEAK_TEST_123&state=STATE_123&api%5Fkey=leaked&accessToken%3Dleaked=1 page=2",
                maxLength = 512,
            )

        assertThat(redacted)
            .contains("?code=[REDACTED]")
            .contains("&state=[REDACTED]")
            .contains("&api_key=[REDACTED]")
            .contains("&accessToken=[REDACTED]")
            .contains("page=2")
            .doesNotContain("LEAK_TEST_123")
            .doesNotContain("STATE_123")
            .doesNotContain("leaked")
    }

    @Test
    @DisplayName("퍼센트 인코딩된 민감 키와 구분자 우회 시도를 모두 마스킹한다")
    fun `redacts percent encoded sensitive keys and delimiters`() {
        val cases =
            listOf(
                "api%5Fkey=leaked",
                "session%5Fkey=leaked",
                "access_toke%6E=leaked",
                "accessToken%3Dleaked",
                "accessToken%3Dleaked=1",
                "%2561ccessToken=leaked",
                "%252561ccessToken=leaked",
                "a=1%26accessToken%3Dleaked",
                "custom_secret=leaked&user_password=leaked&contact_email=leaked&webhook_signature=leaked",
            )

        for (rawQuery in cases) {
            val redacted = SensitiveQueryRedactor.redactQuery(rawQuery)
            assertThat(redacted)
                .contains("[REDACTED]")
                .doesNotContain("leaked")
        }

        assertThat(SensitiveQueryRedactor.redactQuery(null)).isEqualTo("-")
        assertThat(SensitiveQueryRedactor.redactText(" \t\r\n ", 128)).isEqualTo("-")
        assertThat(SensitiveQueryRedactor.redactQuery("=orphan&flag&%GG=ok")).isEqualTo("-&flag&%GG=ok")
    }
}
