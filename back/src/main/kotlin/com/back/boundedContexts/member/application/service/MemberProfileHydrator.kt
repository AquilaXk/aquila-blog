package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_WORKSPACE_DRAFT
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_WORKSPACE_PUBLISHED
import org.springframework.stereotype.Component

@Component
class MemberProfileHydrator(
    private val memberAttrRepository: MemberAttrRepositoryPort,
) {
    private val profileAttrNames =
        listOf(
            PROFILE_WORKSPACE_DRAFT,
            PROFILE_WORKSPACE_PUBLISHED,
        )

    fun hydrate(member: Member): Member = hydrateAll(listOf(member)).first()

    fun hydrateAll(members: List<Member>): List<Member> {
        if (members.isEmpty()) return members

        val uniqueMembers = members.distinctBy { it.id }
        val attrsByKey =
            memberAttrRepository
                .findBySubjectInAndNameIn(uniqueMembers, profileAttrNames)
                .associateBy { "${it.subject.id}:${it.name}" }

        uniqueMembers.forEach { member ->
            member.getProfileWorkspaceDraftAttr {
                attrsByKey["${member.id}:$PROFILE_WORKSPACE_DRAFT"]
                    ?: throw IllegalStateException("profile workspace draft is missing")
            }
            member.getProfileWorkspacePublishedAttr {
                attrsByKey["${member.id}:$PROFILE_WORKSPACE_PUBLISHED"]
                    ?: throw IllegalStateException("profile workspace published is missing")
            }
        }

        return members
    }
}
