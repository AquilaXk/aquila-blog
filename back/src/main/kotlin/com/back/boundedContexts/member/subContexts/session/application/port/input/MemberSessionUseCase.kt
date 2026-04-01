package com.back.boundedContexts.member.subContexts.session.application.port.input

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.session.model.MemberSession

interface MemberSessionUseCase {
    fun createSession(
        member: Member,
        rememberLoginEnabled: Boolean,
        ipSecurityEnabled: Boolean,
        ipSecurityFingerprint: String?,
        createdIp: String?,
        userAgent: String?,
    ): MemberSession

    fun findActiveSession(sessionKey: String): MemberSession?

    fun findActiveSession(
        memberId: Long,
        sessionKey: String,
    ): MemberSession?

    fun touchAuthenticated(memberSession: MemberSession)

    fun revokeSession(sessionKey: String)
}
