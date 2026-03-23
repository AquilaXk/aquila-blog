package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.input.AuthTokenIssueUseCase
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.util.Date

/**
 * AuthTokenService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class AuthTokenService(
    @param:Value("\${custom.jwt.secretKey}")
    private val jwtSecretKey: String,
    @param:Value("\${custom.accessToken.expirationSeconds}")
    private val accessTokenExpirationSeconds: Int,
) : AuthTokenIssueUseCase {
    init {
        require(jwtSecretKey.isNotBlank()) { "CUSTOM__JWT__SECRET_KEY must be configured." }
        require(jwtSecretKey.toByteArray().size >= 32) { "CUSTOM__JWT__SECRET_KEY must be at least 32 bytes." }
    }

    override fun genAccessToken(member: Member): String =
        Jwts
            .builder()
            .claims(
                mapOf(
                    "id" to member.id,
                    "email" to member.email,
                    "name" to member.name,
                    "rememberLoginEnabled" to member.rememberLoginEnabled,
                    "ipSecurityEnabled" to member.ipSecurityEnabled,
                    "ipSecurityFingerprint" to member.ipSecurityFingerprint,
                ),
            ).issuedAt(Date())
            .expiration(Date(System.currentTimeMillis() + accessTokenExpirationSeconds * 1000L))
            .signWith(Keys.hmacShaKeyFor(jwtSecretKey.toByteArray()))
            .compact()

    /**
     * payload 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    fun payload(accessToken: String): AccessTokenPayload? {
        val payload =
            runCatching {
                @Suppress("UNCHECKED_CAST")
                Jwts
                    .parser()
                    .verifyWith(Keys.hmacShaKeyFor(jwtSecretKey.toByteArray()))
                    .build()
                    .parse(accessToken)
                    .payload as Map<String, Any>
            }.getOrNull() ?: return null

        return AccessTokenPayload(
            id = (payload["id"] as? Number)?.toLong() ?: return null,
            username = payload["username"] as? String,
            email = payload["email"] as? String,
            name = payload["name"] as? String ?: return null,
            rememberLoginEnabled = payload["rememberLoginEnabled"] as? Boolean ?: true,
            ipSecurityEnabled = payload["ipSecurityEnabled"] as? Boolean ?: false,
            ipSecurityFingerprint = payload["ipSecurityFingerprint"] as? String,
        )
    }
}
