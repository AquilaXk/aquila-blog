package com.back.boundedContexts.member.subContexts.session.model

data class MemberSessionWithRefreshToken(
    val session: MemberSession,
    val refreshToken: String,
)
