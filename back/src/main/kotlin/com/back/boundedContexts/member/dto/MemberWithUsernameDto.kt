package com.back.boundedContexts.member.dto

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.member.domain.shared.memberMixin.defaultProfileImageUrl
import com.back.global.storage.application.UploadedFileUrlCodec
import com.fasterxml.jackson.annotation.JsonProperty
import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant

data class MemberProfileLinkItemDto(
    val icon: String,
    val label: String,
    val href: String,
) {
    constructor(item: MemberProfileLinkItem) : this(
        icon = item.icon,
        label = item.label,
        href = item.href,
    )
}

data class MemberWithUsernameDto(
    val id: Long,
    val createdAt: Instant,
    val modifiedAt: Instant,
    @get:JsonProperty("isAdmin")
    @get:Schema(name = "isAdmin", requiredMode = Schema.RequiredMode.REQUIRED)
    val isAdmin: Boolean,
    val username: String,
    val name: String,
    val nickname: String,
    val profileImageUrl: String,
    val profileImageDirectUrl: String,
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
    val blogDesign: String,
    val legacyBlogScheme: String,
    val serviceLinks: List<MemberProfileLinkItemDto>,
    val contactLinks: List<MemberProfileLinkItemDto>,
) {
    constructor(
        member: Member,
        workspaceContent: MemberProfileWorkspaceContent,
        workspaceModifiedAt: Instant,
    ) : this(
        id = member.id,
        createdAt = member.createdAt,
        modifiedAt = member.modifiedAt,
        isAdmin = member.isAdmin,
        // 내부 username은 외부 응답에 그대로 노출하지 않고 공개 표시용 닉네임으로 마스킹한다.
        username = member.name,
        name = member.name,
        nickname = member.nickname,
        profileImageUrl = resolveProfileImageUrl(workspaceContent, workspaceModifiedAt),
        profileImageDirectUrl = resolveProfileImageDirectUrl(workspaceContent, workspaceModifiedAt),
        profileRole = workspaceContent.profileRole,
        profileBio = workspaceContent.profileBio,
        aboutHeadline = workspaceContent.aboutHeadline,
        aboutRole = workspaceContent.aboutRole,
        aboutBio = workspaceContent.aboutBio,
        aboutSections = workspaceContent.aboutSections.map(::MemberProfileAboutSectionBlockDto),
        aboutProjectSectionTitle = workspaceContent.aboutProjectSectionTitle,
        aboutProjects = workspaceContent.aboutProjects.map(::MemberProfileAboutProjectBlockDto),
        blogTitle = workspaceContent.blogTitle,
        homeIntroTitle = workspaceContent.homeIntroTitle,
        homeIntroDescription = workspaceContent.homeIntroDescription,
        blogDesign = workspaceContent.blogDesign,
        legacyBlogScheme = workspaceContent.legacyBlogScheme,
        serviceLinks = workspaceContent.serviceLinks.map(::MemberProfileLinkItemDto),
        contactLinks = workspaceContent.contactLinks.map(::MemberProfileLinkItemDto),
    )

    companion object {
        private fun appendVersion(
            url: String,
            modifiedAt: Instant?,
        ): String {
            if (url.isBlank() || modifiedAt == null || url == defaultProfileImageUrl()) return url
            val separator = if (url.contains("?")) "&" else "?"
            return "$url${separator}v=${modifiedAt.toEpochMilli()}"
        }

        private fun resolveProfileImageDirectUrl(
            workspaceContent: MemberProfileWorkspaceContent,
            workspaceModifiedAt: Instant,
        ): String =
            (
                workspaceContent
                    .profileImageUrl
                    .trim()
                    .takeIf(String::isNotBlank)
                    ?.let { appendVersion(it, workspaceModifiedAt) }
                    ?: defaultProfileImageUrl()
            ).let(UploadedFileUrlCodec::canonicalizePublicStorageUrl)

        private fun resolveProfileImageUrl(
            workspaceContent: MemberProfileWorkspaceContent,
            workspaceModifiedAt: Instant,
        ): String =
            (
                workspaceContent
                    .profileImageUrl
                    .trim()
                    .takeIf(String::isNotBlank)
                    ?.let { appendVersion(it, workspaceModifiedAt) }
                    ?: defaultProfileImageUrl()
            ).let(UploadedFileUrlCodec::canonicalizePublicStorageUrl)
    }
}
