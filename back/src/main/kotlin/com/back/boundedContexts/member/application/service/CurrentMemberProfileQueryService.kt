package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.input.CurrentMemberProfileQueryUseCase
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * CurrentMemberProfileQueryService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class CurrentMemberProfileQueryService(
    private val memberRepository: MemberRepositoryPort,
    private val memberProfileHydrator: MemberProfileHydrator,
) : CurrentMemberProfileQueryUseCase {
    @Transactional(readOnly = true)
    override fun getById(id: Long): MemberWithUsernameDto {
        val member = memberRepository.findById(id).orElseThrow()

        return MemberWithUsernameDto(memberProfileHydrator.hydrate(member))
    }
}
