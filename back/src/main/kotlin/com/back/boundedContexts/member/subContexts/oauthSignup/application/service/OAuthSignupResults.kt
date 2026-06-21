package com.back.boundedContexts.member.subContexts.oauthSignup.application.service

import java.time.Instant

data class OAuthSignupPendingStartResult(
    val provider: String,
    val pendingToken: String,
    val expiresAt: Instant,
)

data class OAuthSignupPendingDetails(
    val provider: String,
    val nickname: String,
    val profileImgUrl: String?,
    val expiresAt: Instant,
)
