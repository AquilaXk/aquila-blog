package com.back.boundedContexts.member.subContexts.privacy.application.port.output

import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequest
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestType
import java.time.Instant
import java.util.Optional

interface MemberPrivacyRequestRepositoryPort {
    fun save(memberPrivacyRequest: MemberPrivacyRequest): MemberPrivacyRequest

    fun findByIdAndMemberId(
        id: Long,
        memberId: Long,
    ): MemberPrivacyRequest?

    fun findByIdForUpdate(id: Long): Optional<MemberPrivacyRequest>

    fun findById(id: Long): Optional<MemberPrivacyRequest>

    fun findAllByOrderByRequestedAtDescIdDesc(): List<MemberPrivacyRequest>

    fun existsByMemberIdAndTypeAndStatusIn(
        memberId: Long,
        type: MemberPrivacyRequestType,
        statuses: Collection<MemberPrivacyRequestStatus>,
    ): Boolean

    fun deleteClosedBefore(
        cutoff: Instant,
        limit: Int,
    ): Int
}
