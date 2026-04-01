package com.back.boundedContexts.member.subContexts.session.adapter.persistence

import com.back.boundedContexts.member.subContexts.session.application.port.output.MemberSessionStorePort
import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import org.springframework.stereotype.Component

@Component
class MemberSessionRepositoryAdapter(
    private val memberSessionRepository: MemberSessionRepository,
) : MemberSessionStorePort {
    override fun save(memberSession: MemberSession): MemberSession = memberSessionRepository.save(memberSession)

    override fun findBySessionKey(sessionKey: String): MemberSession? = memberSessionRepository.findBySessionKey(sessionKey)

    override fun findBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSession? =
        memberSessionRepository.findBySessionKeyAndRevokedAtIsNull(sessionKey)

    override fun findByMemberIdAndSessionKeyAndRevokedAtIsNull(
        memberId: Long,
        sessionKey: String,
    ): MemberSession? = memberSessionRepository.findByMemberIdAndSessionKeyAndRevokedAtIsNull(memberId, sessionKey)
}
