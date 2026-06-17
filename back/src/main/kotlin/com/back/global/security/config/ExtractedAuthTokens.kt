package com.back.global.security.config

data class ExtractedAuthTokens(
    val apiKey: String,
    val accessToken: String,
    val sessionKey: String,
    val refreshToken: String,
)
