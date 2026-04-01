package com.back.boundedContexts.member.subContexts.session.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.boundedContexts.member.subContexts.session.adapter.persistence.MemberSessionRepository
import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * 로그인 세션 생성/조회/폐기를 담당하는 서비스입니다.
 */
@Service
class MemberSessionService(
    private val memberSessionRepository: MemberSessionRepository,
) {
    @Transactional
    fun createSession(
        member: Member,
        rememberLoginEnabled: Boolean,
        ipSecurityEnabled: Boolean,
        ipSecurityFingerprint: String?,
        createdIp: String?,
        userAgent: String?,
    ): MemberSession {
        val session =
            MemberSession(
                member = member,
                sessionKey = MemberPolicy.genApiKey(),
                rememberLoginEnabled = rememberLoginEnabled,
                ipSecurityEnabled = ipSecurityEnabled,
                ipSecurityFingerprint = if (ipSecurityEnabled) ipSecurityFingerprint else null,
                createdIp = createdIp?.take(120),
                userAgent = userAgent?.take(512),
            )
        session.touchAuthenticated()
        return memberSessionRepository.save(session)
    }

    @Transactional(readOnly = true)
    fun findActiveSession(sessionKey: String): MemberSession? {
        if (sessionKey.isBlank()) return null
        return memberSessionRepository.findBySessionKeyAndRevokedAtIsNull(sessionKey)
    }

    @Transactional(readOnly = true)
    fun findActiveSession(
        memberId: Long,
        sessionKey: String,
    ): MemberSession? {
        if (sessionKey.isBlank()) return null
        return memberSessionRepository.findByMemberIdAndSessionKeyAndRevokedAtIsNull(memberId, sessionKey)
    }

    @Transactional
    fun touchAuthenticated(memberSession: MemberSession) {
        memberSession.touchAuthenticated()
    }

    @Transactional
    fun revokeSession(sessionKey: String) {
        if (sessionKey.isBlank()) return
        val session = memberSessionRepository.findBySessionKeyAndRevokedAtIsNull(sessionKey) ?: return
        session.revoke()
    }
}
