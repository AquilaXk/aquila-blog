package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class AuthTokenServiceTest {
    private val authTokenService =
        AuthTokenService(
            jwtSecretKey = "test-secret-key-that-is-long-enough-123",
            accessTokenExpirationSeconds = 3600,
        )

    @Test
    fun `발급한 액세스 토큰은 다시 payload 로 파싱할 수 있다`() {
        val member =
            Member(
                id = 1,
                username = "user1",
                password = "1234",
                nickname = "유저1",
                email = "user1@example.com",
            )

        val accessToken = authTokenService.genAccessToken(member)

        assertThat(accessToken).isNotBlank()
        assertThat(accessToken.split(".")).hasSize(3)
        assertThat(authTokenService.payload(accessToken))
            .isEqualTo(AccessTokenPayload(member.id, member.username, member.name))
    }

    @Test
    fun `형식이 잘못된 액세스 토큰은 payload 파싱 결과가 null 이다`() {
        assertThat(authTokenService.payload("invalid-token")).isNull()
    }
}
