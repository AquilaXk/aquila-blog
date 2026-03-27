package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.input.CurrentMemberProfileQueryUseCase
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.memberMixin.normalizeMemberProfileWorkspaceContent
import com.back.boundedContexts.member.dto.MemberProfileWorkspaceContentDto
import com.back.boundedContexts.member.dto.MemberProfileWorkspaceResponseDto
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
        val member = findHydratedMember(id)

        return MemberWithUsernameDto(member)
    }

    @Transactional(readOnly = true)
    override fun getPublishedById(id: Long): MemberWithUsernameDto {
        val member = findHydratedMember(id)
        return MemberWithUsernameDto(
            member = member,
            workspaceContent = member.getProfileWorkspacePublishedContent(),
            workspaceModifiedAt = member.profileWorkspacePublishedModifiedAtOrNull() ?: member.modifiedAt,
        )
    }

    @Transactional(readOnly = true)
    override fun getWorkspaceById(id: Long): MemberProfileWorkspaceResponseDto {
        val member = findHydratedMember(id)
        val draft = normalizeMemberProfileWorkspaceContent(member.getProfileWorkspaceDraftContent())
        val published = normalizeMemberProfileWorkspaceContent(member.getProfileWorkspacePublishedContent())

        return MemberProfileWorkspaceResponseDto(
            draft = MemberProfileWorkspaceContentDto(draft),
            published = MemberProfileWorkspaceContentDto(published),
            lastDraftSavedAt = member.profileWorkspaceDraftModifiedAtOrNull() ?: member.modifiedAt,
            lastPublishedAt = member.profileWorkspacePublishedModifiedAtOrNull() ?: member.modifiedAt,
            dirtyFromPublished = draft != published,
        )
    }

    private fun findHydratedMember(id: Long) = memberProfileHydrator.hydrate(memberRepository.findById(id).orElseThrow())
}
