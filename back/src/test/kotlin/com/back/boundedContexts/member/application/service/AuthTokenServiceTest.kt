package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.Date

@org.junit.jupiter.api.DisplayName("AuthTokenService 테스트")
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
            .isEqualTo(
                AccessTokenPayload(
                    id = member.id,
                    email = member.email,
                    name = member.name,
                ),
            )
    }

    @Test
    fun `형식이 잘못된 액세스 토큰은 payload 파싱 결과가 null 이다`() {
        assertThat(authTokenService.payload("invalid-token")).isNull()
    }

    @Test
    fun `legacy username claim 만 있는 액세스 토큰도 파싱할 수 있다`() {
        val member =
            Member(
                id = 1,
                username = "user1",
                password = "1234",
                nickname = "유저1",
                email = "user1@example.com",
            )

        val legacyToken =
            Jwts
                .builder()
                .claims(
                    mapOf(
                        "id" to member.id,
                        "username" to member.username,
                        "name" to member.name,
                    ),
                ).issuedAt(Date())
                .expiration(Date(System.currentTimeMillis() + 3600_000L))
                .signWith(Keys.hmacShaKeyFor("test-secret-key-that-is-long-enough-123".toByteArray()))
                .compact()

        assertThat(authTokenService.payload(legacyToken))
            .isEqualTo(
                AccessTokenPayload(
                    id = member.id,
                    username = member.username,
                    name = member.name,
                ),
            )
    }
}
