package com.back.boundedContexts.member.subContexts.session.application.port.output

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot
import java.time.Instant

interface MemberSessionStorePort {
    fun save(memberSession: MemberSession): MemberSession

    fun findActiveMemberForSessionIssue(memberId: Long): Member?

    fun findBySessionKey(sessionKey: String): MemberSession?

    fun findBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSession?

    fun findWithMemberBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSession?

    fun findByMemberIdAndSessionKeyAndRevokedAtIsNull(
        memberId: Long,
        sessionKey: String,
    ): MemberSession?

    fun findActiveSnapshotBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSessionAuthSnapshot?

    fun findActiveSnapshotByMemberIdAndSessionKeyAndRevokedAtIsNull(
        memberId: Long,
        sessionKey: String,
    ): MemberSessionAuthSnapshot?

    fun touchAuthenticatedIfDue(
        sessionId: Long,
        threshold: Instant,
        now: Instant,
    ): Boolean

    fun revokeActiveSessionsBeyondLimit(
        memberId: Long,
        keepLimit: Int,
        now: Instant,
    ): Int

    fun revokeAllActiveSessionsForMember(
        memberId: Long,
        now: Instant,
    ): Int

    fun deleteRevokedBefore(
        cutoff: Instant,
        limit: Int,
    ): Int
}
