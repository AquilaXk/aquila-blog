package com.back.boundedContexts.member.subContexts.privacy.adapter.persistence

import com.back.boundedContexts.member.subContexts.privacy.model.MemberAccountDeletion
import org.springframework.data.jpa.repository.JpaRepository

interface MemberAccountDeletionRepository : JpaRepository<MemberAccountDeletion, Long> {
    fun existsByMemberId(memberId: Long): Boolean
}
