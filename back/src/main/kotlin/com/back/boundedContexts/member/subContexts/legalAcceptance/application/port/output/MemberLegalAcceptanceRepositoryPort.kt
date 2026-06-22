package com.back.boundedContexts.member.subContexts.legalAcceptance.application.port.output

import com.back.boundedContexts.member.subContexts.legalAcceptance.model.MemberLegalAcceptance

interface MemberLegalAcceptanceRepositoryPort {
    fun save(memberLegalAcceptance: MemberLegalAcceptance): MemberLegalAcceptance

    fun findTopByMemberIdOrderByAcceptedAtDesc(memberId: Long): MemberLegalAcceptance?
}
