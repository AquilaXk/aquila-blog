package com.back.boundedContexts.member.subContexts.privacy.application.port.output

import com.back.boundedContexts.member.subContexts.privacy.model.MemberAccountDeletion
import java.util.Optional

interface MemberAccountDeletionRepositoryPort {
    fun save(memberAccountDeletion: MemberAccountDeletion): MemberAccountDeletion

    fun flush()

    fun existsByMemberId(memberId: Long): Boolean

    fun existsById(id: Long): Boolean

    fun findById(id: Long): Optional<MemberAccountDeletion>
}
