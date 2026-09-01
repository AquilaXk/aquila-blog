package com.back.boundedContexts.member.application.port.output

import com.back.boundedContexts.member.domain.shared.Member
import java.util.Optional

interface MemberRepositoryPort {
    fun count(): Long

    fun save(member: Member): Member

    fun saveAndFlush(member: Member): Member

    fun existsByEmail(email: String): Boolean

    fun findByLoginId(loginId: String): Member?

    fun findByEmail(email: String): Member?

    fun lockEmailIdentityProvisioning(email: String)

    fun findByApiKey(apiKey: String): Member?

    fun findById(id: Long): Optional<Member>

    fun findByIdForUpdate(id: Long): Optional<Member>

    fun getReferenceById(id: Long): Member
}
