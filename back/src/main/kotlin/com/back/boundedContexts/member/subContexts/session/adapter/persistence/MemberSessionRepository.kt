package com.back.boundedContexts.member.subContexts.session.adapter.persistence

import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import org.springframework.data.jpa.repository.JpaRepository

/**
 * 디바이스 단위 로그인 세션 저장소입니다.
 */
interface MemberSessionRepository : JpaRepository<MemberSession, Long> {
    fun findBySessionKey(sessionKey: String): MemberSession?

    fun findBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSession?

    fun findByMemberIdAndSessionKeyAndRevokedAtIsNull(
        memberId: Long,
        sessionKey: String,
    ): MemberSession?
}
