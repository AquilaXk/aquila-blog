package com.back.boundedContexts.member.subContexts.session.application.port.output

import com.back.boundedContexts.member.subContexts.session.model.MemberSession

interface MemberSessionStorePort {
    fun save(memberSession: MemberSession): MemberSession

    fun findBySessionKey(sessionKey: String): MemberSession?

    fun findBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSession?

    fun findByMemberIdAndSessionKeyAndRevokedAtIsNull(
        memberId: Long,
        sessionKey: String,
    ): MemberSession?
}
