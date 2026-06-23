package com.back.boundedContexts.member.subContexts.privacy.application.port.output

import com.back.boundedContexts.member.subContexts.privacy.model.MemberAccountDeletion

interface MemberAccountDeletionRepositoryPort {
    fun save(memberAccountDeletion: MemberAccountDeletion): MemberAccountDeletion

    fun flush()

    fun existsByMemberId(memberId: Long): Boolean
}
