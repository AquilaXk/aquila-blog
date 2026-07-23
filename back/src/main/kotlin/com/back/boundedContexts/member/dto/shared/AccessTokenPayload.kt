package com.back.boundedContexts.member.dto.shared

import java.time.Instant

data class AccessTokenPayload(
    val id: Long,
    val sessionKey: String? = null,
    val username: String? = null,
    val email: String? = null,
    val name: String,
    val rememberLoginEnabled: Boolean = true,
    val ipSecurityEnabled: Boolean = false,
    val ipSecurityFingerprint: String? = null,
    val issuedAt: Instant? = null,
    val expiresAt: Instant? = null,
)
