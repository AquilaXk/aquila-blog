package com.back.boundedContexts.member.app.shared

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.util.Date

@Service
class AuthTokenService(
    @param:Value("\${custom.jwt.secretKey}")
    private val jwtSecretKey: String,
    @param:Value("\${custom.accessToken.expirationSeconds}")
    private val accessTokenExpirationSeconds: Int,
) {
    fun genAccessToken(member: Member): String =
        Jwts.builder()
            .claims(
                mapOf(
                    "id" to member.id,
                    "username" to member.username,
                    "name" to member.name,
                )
            )
            .issuedAt(Date())
            .expiration(Date(System.currentTimeMillis() + accessTokenExpirationSeconds * 1000L))
            .signWith(Keys.hmacShaKeyFor(jwtSecretKey.toByteArray()))
            .compact()

    fun payload(accessToken: String): AccessTokenPayload? {
        val payload = runCatching {
            @Suppress("UNCHECKED_CAST")
            Jwts.parser()
                .verifyWith(Keys.hmacShaKeyFor(jwtSecretKey.toByteArray()))
                .build()
                .parse(accessToken)
                .payload as Map<String, Any>
        }.getOrNull() ?: return null

        return AccessTokenPayload(
            id = (payload["id"] as? Number)?.toInt() ?: return null,
            username = payload["username"] as? String ?: return null,
            name = payload["name"] as? String ?: return null,
        )
    }
}
