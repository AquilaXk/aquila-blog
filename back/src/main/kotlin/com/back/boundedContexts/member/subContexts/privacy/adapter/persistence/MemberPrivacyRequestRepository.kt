package com.back.boundedContexts.member.subContexts.privacy.adapter.persistence

import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberPrivacyRequestRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequest
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

interface MemberPrivacyRequestRepository :
    JpaRepository<MemberPrivacyRequest, Long>,
    MemberPrivacyRequestRepositoryPort {
    override fun findByIdAndMemberId(
        id: Long,
        memberId: Long,
    ): MemberPrivacyRequest?

    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Transactional
    @Query(
        value = """
        delete from member_privacy_request
        where id in (
            select id
            from member_privacy_request
            where status in ('COMPLETED', 'REJECTED')
              and coalesce(completed_at, modified_at, requested_at) < :cutoff
            order by coalesce(completed_at, modified_at, requested_at) asc, id asc
            limit :limit
        )
        """,
        nativeQuery = true,
    )
    override fun deleteClosedBefore(
        @Param("cutoff") cutoff: Instant,
        @Param("limit") limit: Int,
    ): Int
}
