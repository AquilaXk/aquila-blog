package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.BLOG_DESIGN
import com.back.boundedContexts.member.domain.shared.memberMixin.LEGACY_BLOG_SCHEME
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.member.domain.shared.memberMixin.normalizeMemberProfileWorkspaceContent
import org.springframework.stereotype.Service

data class UpdateProfileCardCommand(
    val role: String,
    val bio: String,
    val aboutRole: String?,
    val aboutBio: String?,
    val aboutDetails: String?,
    val blogTitle: String,
    val homeIntroTitle: String,
    val homeIntroDescription: String,
    val blogDesign: String,
    val legacyBlogScheme: String,
    val serviceLinks: List<MemberProfileLinkItem>,
    val contactLinks: List<MemberProfileLinkItem>,
)

data class ProfileImageSyncRequest(
    val previousProfileImgUrl: String?,
    val currentProfileImgUrl: String?,
)

@Service
class MemberProfilePersistenceService(
    private val memberAttrRepository: MemberAttrRepositoryPort,
) {
    fun saveProfileImage(member: Member) {
        memberAttrRepository.save(member.getOrInitProfileImgUrlAttr())
    }

    fun ensureWorkspaceSnapshotsInitialized(member: Member) {
        val legacyContent = member.currentProfileWorkspaceContent
        if (!member.hasPersistedProfileWorkspacePublished()) {
            member.setProfileWorkspacePublishedContent(legacyContent)
            saveProfileWorkspacePublishedAttr(member)
        }
        if (!member.hasPersistedProfileWorkspaceDraft()) {
            member.setProfileWorkspaceDraftContent(legacyContent)
            saveProfileWorkspaceDraftAttr(member)
        }
    }

    fun updateProfileCard(
        member: Member,
        command: UpdateProfileCardCommand,
    ) {
        member.profileRole = command.role
        member.profileBio = command.bio
        command.aboutRole?.let { member.aboutRole = it }
        command.aboutBio?.let { member.aboutBio = it }
        command.aboutDetails?.let { member.aboutDetails = it }
        member.blogTitle = command.blogTitle
        member.homeIntroTitle = command.homeIntroTitle
        member.homeIntroDescription = command.homeIntroDescription
        member.blogDesign = command.blogDesign
        member.legacyBlogScheme = command.legacyBlogScheme
        member.serviceLinks = command.serviceLinks
        member.contactLinks = command.contactLinks

        saveProfileRoleAttr(member)
        saveProfileBioAttr(member)
        if (command.aboutRole != null) {
            saveAboutRoleAttr(member)
        }
        if (command.aboutBio != null) {
            saveAboutBioAttr(member)
        }
        if (command.aboutDetails != null) {
            saveAboutDetailsAttr(member)
        }
        saveRequiredProfileCardAttrs(member)
        syncDraftWorkspaceFromLegacy(member)
    }

    fun saveWorkspaceDraft(
        member: Member,
        content: MemberProfileWorkspaceContent,
    ): ProfileImageSyncRequest? {
        val normalizedContent = normalizeMemberProfileWorkspaceContent(content)
        val previousProfileImgUrl = member.profileImgUrl
        val publishedProfileImgUrl = member.getProfileWorkspacePublishedContent().profileImageUrl

        member.applyProfileWorkspaceContent(normalizedContent)
        saveProfileImage(member)
        saveAllProfileCardAttrs(member)
        member.setProfileWorkspaceDraftContent(normalizedContent)
        saveProfileWorkspaceDraftAttr(member)

        if (previousProfileImgUrl == member.profileImgUrl) {
            return null
        }

        return ProfileImageSyncRequest(
            previousProfileImgUrl = previousProfileImgUrl.takeUnless { it == publishedProfileImgUrl },
            currentProfileImgUrl = member.profileImgUrl,
        )
    }

    fun publishWorkspace(member: Member): ProfileImageSyncRequest? {
        val previousPublished = member.getProfileWorkspacePublishedContent()
        val draft = member.getProfileWorkspaceDraftContent()
        member.setProfileWorkspacePublishedContent(draft)
        saveProfileWorkspacePublishedAttr(member)

        if (previousPublished.profileImageUrl == draft.profileImageUrl) {
            return null
        }

        return ProfileImageSyncRequest(
            previousProfileImgUrl = previousPublished.profileImageUrl,
            currentProfileImgUrl = draft.profileImageUrl,
        )
    }

    fun syncDraftWorkspaceFromLegacy(member: Member) {
        member.setProfileWorkspaceDraftContent(member.currentProfileWorkspaceContent)
        saveProfileWorkspaceDraftAttr(member)
    }

    private fun saveAllProfileCardAttrs(member: Member) {
        saveProfileRoleAttr(member)
        saveProfileBioAttr(member)
        saveAboutRoleAttr(member)
        saveAboutBioAttr(member)
        saveAboutDetailsAttr(member)
        saveRequiredProfileCardAttrs(member)
    }

    private fun saveRequiredProfileCardAttrs(member: Member) {
        saveBlogTitleAttr(member)
        saveHomeIntroTitleAttr(member)
        saveHomeIntroDescriptionAttr(member)
        saveBlogDesignAttr(member)
        saveLegacyBlogSchemeAttr(member)
        saveServiceLinksAttr(member)
        saveContactLinksAttr(member)
    }

    private fun saveProfileRoleAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitProfileRoleAttr())
    }

    private fun saveProfileBioAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitProfileBioAttr())
    }

    private fun saveAboutRoleAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitAboutRoleAttr())
    }

    private fun saveAboutBioAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitAboutBioAttr())
    }

    private fun saveAboutDetailsAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitAboutDetailsAttr())
    }

    private fun saveBlogTitleAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitBlogTitleAttr())
    }

    private fun saveHomeIntroTitleAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitHomeIntroTitleAttr())
    }

    private fun saveHomeIntroDescriptionAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitHomeIntroDescriptionAttr())
    }

    private fun saveBlogDesignAttr(member: Member) {
        val attr =
            memberAttrRepository.findBySubjectAndName(member, BLOG_DESIGN)
                ?: member.getOrInitBlogDesignAttr()
        attr.strValue = member.blogDesign
        memberAttrRepository.save(attr)
    }

    private fun saveLegacyBlogSchemeAttr(member: Member) {
        val attr =
            memberAttrRepository.findBySubjectAndName(member, LEGACY_BLOG_SCHEME)
                ?: member.getOrInitLegacyBlogSchemeAttr()
        attr.strValue = member.legacyBlogScheme
        memberAttrRepository.save(attr)
    }

    private fun saveServiceLinksAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitServiceLinksAttr())
    }

    private fun saveContactLinksAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitContactLinksAttr())
    }

    private fun saveProfileWorkspaceDraftAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitProfileWorkspaceDraftAttr())
    }

    private fun saveProfileWorkspacePublishedAttr(member: Member) {
        memberAttrRepository.save(member.getOrInitProfileWorkspacePublishedAttr())
    }
}
