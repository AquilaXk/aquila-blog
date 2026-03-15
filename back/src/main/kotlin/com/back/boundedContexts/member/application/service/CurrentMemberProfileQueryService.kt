package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.input.CurrentMemberProfileQueryUseCase
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class CurrentMemberProfileQueryService(
    private val memberRepository: MemberRepositoryPort,
    private val memberProfileHydrator: MemberProfileHydrator,
) : CurrentMemberProfileQueryUseCase {
    @Transactional(readOnly = true)
    override fun getById(id: Int): MemberWithUsernameDto {
        val member = memberRepository.findById(id).orElseThrow()

        return MemberWithUsernameDto(memberProfileHydrator.hydrate(member))
    }
}
