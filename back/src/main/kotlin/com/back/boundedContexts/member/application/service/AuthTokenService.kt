package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.input.AuthTokenIssueUseCase
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
) : AuthTokenIssueUseCase {
    init {
        require(jwtSecretKey.isNotBlank()) { "CUSTOM__JWT__SECRET_KEY must be configured." }
        require(jwtSecretKey.toByteArray().size >= 32) { "CUSTOM__JWT__SECRET_KEY must be at least 32 bytes." }
    }

    override fun genAccessToken(member: Member): String =
        genAccessToken(
            member = member,
            sessionKey = null,
            rememberLoginEnabled = member.rememberLoginEnabled,
            ipSecurityEnabled = member.ipSecurityEnabled,
            ipSecurityFingerprint = member.ipSecurityFingerprint,
        )

    override fun genAccessToken(
        member: Member,
        sessionKey: String?,
        rememberLoginEnabled: Boolean,
        ipSecurityEnabled: Boolean,
        ipSecurityFingerprint: String?,
    ): String =
        Jwts
            .builder()
            .claims(
                mapOf(
                    "id" to member.id,
                    "sessionKey" to sessionKey,
                    "email" to member.email,
                    "name" to member.name,
                    "rememberLoginEnabled" to rememberLoginEnabled,
                    "ipSecurityEnabled" to ipSecurityEnabled,
                    "ipSecurityFingerprint" to ipSecurityFingerprint,
                ),
            ).issuedAt(Date())
            .expiration(Date(System.currentTimeMillis() + accessTokenExpirationSeconds * 1000L))
            .signWith(Keys.hmacShaKeyFor(jwtSecretKey.toByteArray()))
            .compact()

    fun payload(accessToken: String): AccessTokenPayload? {
        val claims =
            runCatching {
                Jwts
                    .parser()
                    .verifyWith(Keys.hmacShaKeyFor(jwtSecretKey.toByteArray()))
                    .build()
                    .parseSignedClaims(accessToken)
                    .payload
            }.getOrNull() ?: return null

        return AccessTokenPayload(
            id = (claims["id"] as? Number)?.toLong() ?: return null,
            sessionKey = claims["sessionKey"] as? String,
            username = claims["username"] as? String,
            email = claims["email"] as? String,
            name = claims["name"] as? String ?: return null,
            rememberLoginEnabled = claims["rememberLoginEnabled"] as? Boolean ?: true,
            ipSecurityEnabled = claims["ipSecurityEnabled"] as? Boolean ?: false,
            ipSecurityFingerprint = claims["ipSecurityFingerprint"] as? String,
            issuedAt = claims.issuedAt?.toInstant(),
            expiresAt = claims.expiration?.toInstant(),
        )
    }
}
