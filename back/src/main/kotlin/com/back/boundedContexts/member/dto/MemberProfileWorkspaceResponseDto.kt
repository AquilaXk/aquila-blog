package com.back.boundedContexts.member.dto

import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileAboutProjectBlock
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

data class MemberProfileAboutProjectBlockDto(
    val id: String,
    val name: String,
    val summary: String,
    val role: String,
    val href: String,
    val linkLabel: String,
) {
    constructor(block: MemberProfileAboutProjectBlock) : this(
        id = block.id,
        name = block.name,
        summary = block.summary,
        role = block.role,
        href = block.href,
        linkLabel = block.linkLabel,
    )
}

data class MemberProfileWorkspaceContentDto(
    val profileImageUrl: String,
    val profileRole: String,
    val profileBio: String,
    val aboutHeadline: String,
    val aboutRole: String,
    val aboutBio: String,
    val aboutSections: List<MemberProfileAboutSectionBlockDto>,
    val aboutProjectSectionTitle: String,
    val aboutProjects: List<MemberProfileAboutProjectBlockDto>,
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
        aboutHeadline = content.aboutHeadline,
        aboutRole = content.aboutRole,
        aboutBio = content.aboutBio,
        aboutSections = content.aboutSections.map(::MemberProfileAboutSectionBlockDto),
        aboutProjectSectionTitle = content.aboutProjectSectionTitle,
        aboutProjects = content.aboutProjects.map(::MemberProfileAboutProjectBlockDto),
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
