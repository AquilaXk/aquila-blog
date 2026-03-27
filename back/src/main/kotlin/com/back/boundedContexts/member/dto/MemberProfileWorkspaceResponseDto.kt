package com.back.boundedContexts.member.dto

import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileAboutSectionBlock
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import java.time.Instant

data class MemberProfileAboutSectionBlockDto(
    val id: String,
    val title: String,
    val items: List<String>,
    val dividerBefore: Boolean,
) {
    constructor(block: MemberProfileAboutSectionBlock) : this(
        id = block.id,
        title = block.title,
        items = block.items,
        dividerBefore = block.dividerBefore,
    )
}

data class MemberProfileWorkspaceContentDto(
    val profileImageUrl: String,
    val profileRole: String,
    val profileBio: String,
    val aboutRole: String,
    val aboutBio: String,
    val aboutSections: List<MemberProfileAboutSectionBlockDto>,
    val blogTitle: String,
    val homeIntroTitle: String,
    val homeIntroDescription: String,
    val serviceLinks: List<MemberProfileLinkItemDto>,
    val contactLinks: List<MemberProfileLinkItemDto>,
) {
    constructor(content: MemberProfileWorkspaceContent) : this(
        profileImageUrl = content.profileImageUrl,
        profileRole = content.profileRole,
        profileBio = content.profileBio,
        aboutRole = content.aboutRole,
        aboutBio = content.aboutBio,
        aboutSections = content.aboutSections.map(::MemberProfileAboutSectionBlockDto),
        blogTitle = content.blogTitle,
        homeIntroTitle = content.homeIntroTitle,
        homeIntroDescription = content.homeIntroDescription,
        serviceLinks = content.serviceLinks.map(::MemberProfileLinkItemDto),
        contactLinks = content.contactLinks.map(::MemberProfileLinkItemDto),
    )
}

data class MemberProfileWorkspaceResponseDto(
    val draft: MemberProfileWorkspaceContentDto,
    val published: MemberProfileWorkspaceContentDto,
    val lastDraftSavedAt: Instant?,
    val lastPublishedAt: Instant?,
    val dirtyFromPublished: Boolean,
)
