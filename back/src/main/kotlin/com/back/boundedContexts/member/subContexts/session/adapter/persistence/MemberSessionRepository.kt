package com.back.boundedContexts.member.subContexts.session.adapter.persistence

import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.time.Instant

/**
 * 디바이스 단위 로그인 세션 저장소입니다.
 */
interface MemberSessionRepository : JpaRepository<MemberSession, Long> {
    fun findBySessionKey(sessionKey: String): MemberSession?

    fun findBySessionKeyAndRevokedAtIsNull(sessionKey: String): MemberSession?

    @Query(
        """
        select session
        from MemberSession session
        join fetch session.member
        where session.sessionKey = :sessionKey
          and session.revokedAt is null
        """,
    )
    fun findWithMemberBySessionKeyAndRevokedAtIsNull(
        @Param("sessionKey") sessionKey: String,
    ): MemberSession?

    fun findByMemberIdAndSessionKeyAndRevokedAtIsNull(
        memberId: Long,
        sessionKey: String,
    ): MemberSession?

    @Query(
        """
        select new com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot(
            session.id,
            session.member.id,
            session.sessionKey,
            session.rememberLoginEnabled,
            session.ipSecurityEnabled,
            session.ipSecurityFingerprint,
            session.lastAuthenticatedAt
        )
        from MemberSession session
        where session.sessionKey = :sessionKey
          and session.revokedAt is null
        """,
    )
    fun findActiveSnapshotBySessionKeyAndRevokedAtIsNull(
        @Param("sessionKey") sessionKey: String,
    ): MemberSessionAuthSnapshot?

    @Query(
        """
        select new com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot(
            session.id,
            session.member.id,
            session.sessionKey,
            session.rememberLoginEnabled,
            session.ipSecurityEnabled,
            session.ipSecurityFingerprint,
            session.lastAuthenticatedAt
        )
        from MemberSession session
        where session.member.id = :memberId
          and session.sessionKey = :sessionKey
          and session.revokedAt is null
        """,
    )
    fun findActiveSnapshotByMemberIdAndSessionKeyAndRevokedAtIsNull(
        @Param("memberId") memberId: Long,
        @Param("sessionKey") sessionKey: String,
    ): MemberSessionAuthSnapshot?

    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Query(
        """
        update MemberSession session
        set session.lastAuthenticatedAt = :now
        where session.id = :sessionId
          and (session.lastAuthenticatedAt is null or session.lastAuthenticatedAt < :threshold)
        """,
    )
    fun touchAuthenticatedIfDue(
        @Param("sessionId") sessionId: Long,
        @Param("threshold") threshold: Instant,
        @Param("now") now: Instant,
    ): Int

    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Query(
        value = """
        update member_session
        set revoked_at = :now
        where member_id = :memberId
          and revoked_at is null
          and id not in (
              select id
              from member_session
              where member_id = :memberId
                and revoked_at is null
              order by last_authenticated_at desc nulls last, id desc
              limit :keepLimit
          )
        """,
        nativeQuery = true,
    )
    fun revokeActiveSessionsBeyondLimit(
        @Param("memberId") memberId: Long,
        @Param("keepLimit") keepLimit: Int,
        @Param("now") now: Instant,
    ): Int
}
