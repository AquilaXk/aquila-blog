package com.back.boundedContexts.member.subContexts.legalAcceptance.adapter.persistence

import com.back.boundedContexts.member.subContexts.legalAcceptance.application.port.output.MemberLegalAcceptanceRepositoryPort
import com.back.boundedContexts.member.subContexts.legalAcceptance.model.MemberLegalAcceptance
import org.springframework.data.jpa.repository.JpaRepository

interface MemberLegalAcceptanceRepository :
    JpaRepository<MemberLegalAcceptance, Long>,
    MemberLegalAcceptanceRepositoryPort {
    override fun findTopByMemberIdOrderByAcceptedAtDesc(memberId: Long): MemberLegalAcceptance?
}
