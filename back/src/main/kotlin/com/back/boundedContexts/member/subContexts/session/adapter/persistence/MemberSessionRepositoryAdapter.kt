package com.back.boundedContexts.member.subContexts.session.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.session.application.port.output.MemberSessionStorePort
import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot
import jakarta.persistence.EntityManager
import jakarta.persistence.LockModeType
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class MemberSessionRepositoryAdapter(
    private val memberSessionRepository: MemberSessionRepository,
    private val entityManager: EntityManager,
) : MemberSessionStorePort {
    override fun save(memberSession: MemberSession): MemberSession = memberSessionRepository.save(memberSession)

    override fun findActiveMemberForSessionIssue(memberId: Long): Member? =
        entityManager
            .createQuery(
                """
                select member
                from Member member
                where member.id = :memberId
                  and member.deletedAt is null
                """.trimIndent(),
                Member::class.java,
            ).setParameter("memberId", memberId)
            .setLockMode(LockModeType.PESSIMISTIC_WRITE)
            .resultList
            .singleOrNull()

    override fun findBySessionKey(sessionKey: String): MemberSession? = memberSessionRepository.findBySessionKey(sessionKey)

    override fun findBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSession? =
        memberSessionRepository.findBySessionKeyAndRevokedAtIsNull(sessionKey)

    override fun findWithMemberBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSession? =
        memberSessionRepository.findWithMemberBySessionKeyAndRevokedAtIsNull(sessionKey)

    override fun findByMemberIdAndSessionKeyAndRevokedAtIsNull(
        memberId: Long,
        sessionKey: String,
    ): MemberSession? = memberSessionRepository.findByMemberIdAndSessionKeyAndRevokedAtIsNull(memberId, sessionKey)

    override fun findActiveSnapshotBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSessionAuthSnapshot? =
        memberSessionRepository.findActiveSnapshotBySessionKeyAndRevokedAtIsNull(sessionKey)

    override fun findActiveSnapshotByMemberIdAndSessionKeyAndRevokedAtIsNull(
        memberId: Long,
        sessionKey: String,
    ): MemberSessionAuthSnapshot? =
        memberSessionRepository.findActiveSnapshotByMemberIdAndSessionKeyAndRevokedAtIsNull(memberId, sessionKey)

    override fun touchAuthenticatedIfDue(
        sessionId: Long,
        threshold: Instant,
        now: Instant,
    ): Boolean = memberSessionRepository.touchAuthenticatedIfDue(sessionId, threshold, now) > 0

    override fun revokeActiveSessionsBeyondLimit(
        memberId: Long,
        keepLimit: Int,
        now: Instant,
    ): Int = memberSessionRepository.revokeActiveSessionsBeyondLimit(memberId, keepLimit.coerceAtLeast(1), now)

    override fun revokeAllActiveSessionsForMember(
        memberId: Long,
        now: Instant,
    ): Int = memberSessionRepository.revokeAllActiveSessionsForMember(memberId, now)

    override fun deleteRevokedBefore(
        cutoff: Instant,
        limit: Int,
    ): Int = memberSessionRepository.deleteRevokedBefore(cutoff, limit.coerceIn(1, 1_000))
}
