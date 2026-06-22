package com.back.boundedContexts.member.subContexts.privacy.adapter.persistence

import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberPrivacyRequestRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequest
import org.springframework.data.jpa.repository.JpaRepository

interface MemberPrivacyRequestRepository :
    JpaRepository<MemberPrivacyRequest, Long>,
    MemberPrivacyRequestRepositoryPort {
    override fun findByIdAndMemberId(
        id: Long,
        memberId: Long,
    ): MemberPrivacyRequest?
}
