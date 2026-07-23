package com.back.boundedContexts.member.subContexts.memberActionLog.adapter.persistence

import com.back.boundedContexts.member.subContexts.memberActionLog.application.port.output.MemberActionLogRepositoryPort
import com.back.boundedContexts.member.subContexts.memberActionLog.domain.MemberActionLog
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

interface MemberActionLogRepository :
    JpaRepository<MemberActionLog, Long>,
    MemberActionLogRepositoryPort {
    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Transactional
    @Query(
        value = """
        delete from member_action_log
        where id in (
            select id
            from member_action_log
            where created_at < :cutoff
            order by created_at asc, id asc
            limit :limit
        )
        """,
        nativeQuery = true,
    )
    override fun deleteCreatedBefore(
        @Param("cutoff") cutoff: Instant,
        @Param("limit") limit: Int,
    ): Int
}
