package com.back.boundedContexts.member.subContexts.privacy.adapter.persistence

import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberAccountDeletionRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.model.MemberAccountDeletion
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

interface MemberAccountDeletionRepository :
    JpaRepository<MemberAccountDeletion, Long>,
    MemberAccountDeletionRepositoryPort {
    override fun existsByMemberId(memberId: Long): Boolean

    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Transactional
    @Query(
        value = """
        delete from member_account_deletion
        where id in (
            select id
            from member_account_deletion
            where deleted_at < :cutoff
            order by deleted_at asc, id asc
            limit :limit
        )
        """,
        nativeQuery = true,
    )
    override fun deleteDeletedBefore(
        @Param("cutoff") cutoff: Instant,
        @Param("limit") limit: Int,
    ): Int
}
