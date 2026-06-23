package com.back.boundedContexts.member.subContexts.privacy.application.port.output

import com.back.boundedContexts.member.subContexts.privacy.model.MemberAccountDeletion
import java.time.Instant

interface MemberAccountDeletionRepositoryPort {
    fun save(memberAccountDeletion: MemberAccountDeletion): MemberAccountDeletion

    fun flush()

    fun existsByMemberId(memberId: Long): Boolean

    fun deleteDeletedBefore(
        cutoff: Instant,
        limit: Int,
    ): Int
}
