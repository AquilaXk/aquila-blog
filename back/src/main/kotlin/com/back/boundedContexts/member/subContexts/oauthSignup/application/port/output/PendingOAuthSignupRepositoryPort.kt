package com.back.boundedContexts.member.subContexts.oauthSignup.application.port.output

interface PendingOAuthSignupRepositoryPort {
    fun deleteByMemberLoginId(memberLoginId: String): Int
}
