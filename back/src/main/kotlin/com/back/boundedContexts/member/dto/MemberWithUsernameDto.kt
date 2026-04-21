package com.back.boundedContexts.member.dto

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.member.domain.shared.memberMixin.convertAboutSectionsToLegacyDetails
import com.back.boundedContexts.member.domain.shared.memberMixin.parseLegacyAboutDetailsToBlocks
import java.time.Instant

/**
 * `MemberProfileLinkItemDto` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
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

/**
 * `MemberWithUsernameDto` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
data class MemberWithUsernameDto(
    val id: Long,
    val createdAt: Instant,
    val modifiedAt: Instant,
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
    val aboutDetails: String,
    val aboutSections: List<MemberProfileAboutSectionBlockDto>,
    val aboutProjectSectionTitle: String,
    val aboutProjects: List<MemberProfileAboutProjectBlockDto>,
    val blogTitle: String,
    val homeIntroTitle: String,
    val homeIntroDescription: String,
    val serviceLinks: List<MemberProfileLinkItemDto>,
    val contactLinks: List<MemberProfileLinkItemDto>,
) {
    constructor(member: Member) : this(member, null, null)

    constructor(
        member: Member,
        workspaceContent: MemberProfileWorkspaceContent?,
        workspaceModifiedAt: Instant?,
    ) : this(
        id = member.id,
        createdAt = member.createdAt,
        modifiedAt = member.modifiedAt,
        isAdmin = member.isAdmin,
        // 내부 username은 외부 응답에 그대로 노출하지 않고 공개 표시용 닉네임으로 마스킹한다.
        username = member.name,
        name = member.name,
        nickname = member.nickname,
        profileImageUrl = resolveProfileImageUrl(member, workspaceContent, workspaceModifiedAt),
        profileImageDirectUrl = resolveProfileImageDirectUrl(member, workspaceContent, workspaceModifiedAt),
        profileRole = workspaceContent?.profileRole ?: member.profileRole,
        profileBio = workspaceContent?.profileBio ?: member.profileBio,
        aboutHeadline = workspaceContent?.aboutHeadline.orEmpty(),
        aboutRole = workspaceContent?.aboutRole ?: member.aboutRole,
        aboutBio = workspaceContent?.aboutBio ?: member.aboutBio,
        aboutDetails =
            workspaceContent?.let {
                convertAboutSectionsToLegacyDetails(it.aboutSections)
            } ?: member.aboutDetails,
        aboutSections =
            (
                workspaceContent?.aboutSections
                    ?: parseLegacyAboutDetailsToBlocks(member.aboutDetails)
            ).map(::MemberProfileAboutSectionBlockDto),
        aboutProjectSectionTitle = workspaceContent?.aboutProjectSectionTitle.orEmpty(),
        aboutProjects =
            (
                workspaceContent?.aboutProjects
                    ?: emptyList()
            ).map(::MemberProfileAboutProjectBlockDto),
        blogTitle = workspaceContent?.blogTitle ?: member.blogTitle,
        homeIntroTitle = workspaceContent?.homeIntroTitle ?: member.homeIntroTitle,
        homeIntroDescription = workspaceContent?.homeIntroDescription ?: member.homeIntroDescription,
        serviceLinks =
            (
                workspaceContent?.serviceLinks
                    ?: member.serviceLinks
            ).map(::MemberProfileLinkItemDto),
        contactLinks =
            (
                workspaceContent?.contactLinks
                    ?: member.contactLinks
            ).map(::MemberProfileLinkItemDto),
    )

    companion object {
        private fun appendVersion(
            url: String,
            modifiedAt: Instant?,
        ): String {
            if (url.isBlank() || modifiedAt == null || url.startsWith("https://placehold.co/")) return url
            val separator = if (url.contains("?")) "&" else "?"
            return "$url${separator}v=${modifiedAt.toEpochMilli()}"
        }

        private fun resolveProfileImageDirectUrl(
            member: Member,
            workspaceContent: MemberProfileWorkspaceContent?,
            workspaceModifiedAt: Instant?,
        ): String =
            workspaceContent
                ?.profileImageUrl
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?.let { appendVersion(it, workspaceModifiedAt ?: member.modifiedAt) }
                ?: member.profileImgUrlVersionedOrDefault

        private fun resolveProfileImageUrl(
            member: Member,
            workspaceContent: MemberProfileWorkspaceContent?,
            workspaceModifiedAt: Instant?,
        ): String =
            workspaceContent
                ?.profileImageUrl
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?.let { appendVersion(it, workspaceModifiedAt ?: member.modifiedAt) }
                ?: member.redirectToProfileImgUrlVersionedOrDefault
    }
}
