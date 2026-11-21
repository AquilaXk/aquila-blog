package com.back.boundedContexts.member.subContexts.session.model

import java.time.Instant

data class MemberSessionAuthSnapshot(
    val id: Long,
    val memberId: Long,
    val sessionKey: String,
    val rememberLoginEnabled: Boolean,
    val ipSecurityEnabled: Boolean,
    val ipSecurityFingerprint: String?,
    val lastAuthenticatedAt: Instant?,
)
