package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.member.domain.shared.memberMixin.normalizeMemberProfileWorkspaceContent
import org.springframework.stereotype.Service

data class ProfileImageSyncRequest(
    val previousProfileImgUrl: String?,
    val currentProfileImgUrl: String?,
)

@Service
class MemberProfilePersistenceService(
    private val memberAttrRepository: MemberAttrRepositoryPort,
) {
    fun initializeWorkspaceSnapshots(
        member: Member,
        content: MemberProfileWorkspaceContent = MemberProfileWorkspaceContent(),
    ): ProfileImageSyncRequest? {
        val normalized = normalizeMemberProfileWorkspaceContent(content)
        member.setProfileWorkspaceDraftContent(normalized)
        member.setProfileWorkspacePublishedContent(normalized)
        memberAttrRepository.save(member.getProfileWorkspaceDraftAttr())
        memberAttrRepository.save(member.getProfileWorkspacePublishedAttr())
        return normalized.profileImageUrl.takeIf(String::isNotBlank)?.let { ProfileImageSyncRequest(null, it) }
    }

    fun saveWorkspaceDraft(
        member: Member,
        content: MemberProfileWorkspaceContent,
    ): ProfileImageSyncRequest? {
        val previousDraft = member.getProfileWorkspaceDraftContent()
        val published = member.getProfileWorkspacePublishedContent()
        val normalized = normalizeMemberProfileWorkspaceContent(content)
        if (previousDraft == normalized) return null

        member.setProfileWorkspaceDraftContent(normalized)
        memberAttrRepository.save(member.getProfileWorkspaceDraftAttr())
        if (previousDraft.profileImageUrl == normalized.profileImageUrl) return null
        return ProfileImageSyncRequest(
            previousProfileImgUrl = previousDraft.profileImageUrl.takeUnless { it == published.profileImageUrl },
            currentProfileImgUrl = normalized.profileImageUrl,
        )
    }

    fun publishWorkspace(member: Member): ProfileImageSyncRequest? {
        val previousPublished = member.getProfileWorkspacePublishedContent()
        val draft = member.getProfileWorkspaceDraftContent()
        if (previousPublished == draft) return null

        member.setProfileWorkspacePublishedContent(draft)
        memberAttrRepository.save(member.getProfileWorkspacePublishedAttr())
        if (previousPublished.profileImageUrl == draft.profileImageUrl) return null
        return ProfileImageSyncRequest(previousPublished.profileImageUrl, draft.profileImageUrl)
    }
}
