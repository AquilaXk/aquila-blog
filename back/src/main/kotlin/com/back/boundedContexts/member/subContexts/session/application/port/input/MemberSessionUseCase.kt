package com.back.boundedContexts.member.subContexts.session.application.port.input

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot

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

    fun findActiveSessionSnapshot(sessionKey: String): MemberSessionAuthSnapshot?

    fun findActiveSessionSnapshot(
        memberId: Long,
        sessionKey: String,
    ): MemberSessionAuthSnapshot?

    fun touchAuthenticated(memberSession: MemberSession)

    fun touchAuthenticated(snapshot: MemberSessionAuthSnapshot)

    fun revokeSession(sessionKey: String)
}
