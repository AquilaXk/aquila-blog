package com.back.boundedContexts.member.application.port.input

import com.back.boundedContexts.member.domain.shared.Member

interface AuthTokenIssueUseCase {
    fun genAccessToken(member: Member): String

    fun genAccessToken(
        member: Member,
        sessionKey: String?,
        rememberLoginEnabled: Boolean,
        ipSecurityEnabled: Boolean,
        ipSecurityFingerprint: String?,
    ): String = genAccessToken(member)
}
