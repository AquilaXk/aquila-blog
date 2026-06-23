package com.back.boundedContexts.member.subContexts.privacy.application.port.output

import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequest
import java.time.Instant

interface MemberPrivacyRequestRepositoryPort {
    fun save(memberPrivacyRequest: MemberPrivacyRequest): MemberPrivacyRequest

    fun findByIdAndMemberId(
        id: Long,
        memberId: Long,
    ): MemberPrivacyRequest?

    fun deleteClosedBefore(
        cutoff: Instant,
        limit: Int,
    ): Int
}
