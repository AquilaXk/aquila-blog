package com.back.boundedContexts.member.domain.shared.memberMixin

import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.global.app.AppConfig
import com.back.standard.util.Ut
import java.net.URI
import java.time.Instant
import java.util.Locale

const val PROFILE_WORKSPACE_DRAFT = "profileWorkspaceDraft"
const val PROFILE_WORKSPACE_PUBLISHED = "profileWorkspacePublished"
const val BLOG_DESIGN_LEGACY = "legacy"
const val BLOG_DESIGN_GRID = "grid"
const val LEGACY_BLOG_SCHEME_LIGHT = "light"
const val LEGACY_BLOG_SCHEME_DARK = "dark"

const val PROFILE_SERVICE_LINK_ICON_DEFAULT_VALUE = "service"
const val PROFILE_CONTACT_LINK_ICON_DEFAULT_VALUE = "message"

val PROFILE_SERVICE_ICON_ALLOWED =
    setOf("service", "briefcase", "laptop", "rocket", "spark", "search", "tag", "camera", "question")

val PROFILE_CONTACT_ICON_ALLOWED =
    setOf("github", "linkedin", "mail", "message", "kakao", "instagram", "globe", "link", "phone", "bell")

private val profileLinkAllowedSchemes = setOf("https", "http", "mailto", "tel")

data class MemberProfileLinkItem(
    val icon: String = PROFILE_SERVICE_LINK_ICON_DEFAULT_VALUE,
    val label: String = "",
    val href: String = "",
)

fun normalizeProfileLinkHref(rawHref: String): String? {
    val href = rawHref.trim()
    if (href.isBlank()) return ""
    if (href.any { it == '\r' || it == '\n' }) return null
    if (href.startsWith("/")) return href.takeUnless { it.startsWith("//") }
    val scheme = runCatching { URI(href).scheme?.lowercase(Locale.ROOT) }.getOrNull() ?: return null
    return href.takeIf { scheme in profileLinkAllowedSchemes }
}

private const val DEFAULT_PROFILE_IMAGE_PATH = "/images/default-profile.svg"

fun defaultProfileImageUrl(): String {
    val siteFrontUrl = AppConfig.siteFrontUrl.trim().trimEnd('/')
    require(siteFrontUrl.isNotBlank()) { "custom.site.frontUrl is required for the default profile image" }
    return "$siteFrontUrl$DEFAULT_PROFILE_IMAGE_PATH"
}

fun normalizeBlogDesign(value: String?): String =
    when (value?.trim()?.lowercase()) {
        BLOG_DESIGN_GRID -> BLOG_DESIGN_GRID
        else -> BLOG_DESIGN_LEGACY
    }

fun normalizeLegacyBlogScheme(value: String?): String =
    when (value?.trim()?.lowercase()) {
        LEGACY_BLOG_SCHEME_LIGHT -> LEGACY_BLOG_SCHEME_LIGHT
        else -> LEGACY_BLOG_SCHEME_DARK
    }

data class MemberProfileAboutSectionBlock(
    val id: String = "",
    val title: String = "",
    val items: List<String> = emptyList(),
    val dividerBefore: Boolean = false,
)

data class MemberProfileAboutProjectBlock(
    val id: String = "",
    val name: String = "",
    val summary: String = "",
    val role: String = "",
    val href: String = "",
    val linkLabel: String = "",
)

data class MemberProfileWorkspaceContent(
    val profileImageUrl: String = "",
    val profileRole: String = "",
    val profileBio: String = "",
    val aboutHeadline: String = "",
    val aboutRole: String = "",
    val aboutBio: String = "",
    val aboutSections: List<MemberProfileAboutSectionBlock> = emptyList(),
    val aboutProjectSectionTitle: String = "",
    val aboutProjects: List<MemberProfileAboutProjectBlock> = emptyList(),
    val blogTitle: String = "",
    val homeIntroTitle: String = "",
    val homeIntroDescription: String = "",
    val blogDesign: String = BLOG_DESIGN_LEGACY,
    val legacyBlogScheme: String = LEGACY_BLOG_SCHEME_DARK,
    val serviceLinks: List<MemberProfileLinkItem> = emptyList(),
    val contactLinks: List<MemberProfileLinkItem> = emptyList(),
)

private data class MemberProfileWorkspaceContentEnvelope(
    val content: MemberProfileWorkspaceContent = MemberProfileWorkspaceContent(),
)

private fun normalizeAboutProjects(projects: List<MemberProfileAboutProjectBlock>): List<MemberProfileAboutProjectBlock> =
    projects.mapIndexedNotNull { index, project ->
        val name = project.name.trim()
        val summary = project.summary.trim()
        val role = project.role.trim()
        val href = project.href.trim()
        val linkLabel = project.linkLabel.trim()
        if (name.isBlank() && summary.isBlank() && role.isBlank() && href.isBlank()) {
            return@mapIndexedNotNull null
        }

        MemberProfileAboutProjectBlock(
            id = project.id.trim().ifBlank { "project-${index + 1}" },
            name = name,
            summary = summary,
            role = role,
            href = href,
            linkLabel = linkLabel.ifBlank { if (href.isBlank()) "" else "링크 보기" },
        )
    }

fun normalizeMemberProfileWorkspaceContent(content: MemberProfileWorkspaceContent): MemberProfileWorkspaceContent {
    val normalizedSections =
        content.aboutSections.mapIndexedNotNull { index, section ->
            val normalizedTitle = section.title.trim()
            val normalizedItems =
                section.items
                    .map(String::trim)
                    .filter(String::isNotBlank)
            val hasContent = normalizedTitle.isNotBlank() || normalizedItems.isNotEmpty()
            if (!hasContent) {
                return@mapIndexedNotNull null
            }

            MemberProfileAboutSectionBlock(
                id = section.id.trim().ifBlank { "section-${index + 1}" },
                title = normalizedTitle,
                items = normalizedItems,
                dividerBefore = section.dividerBefore,
            )
        }
    val normalizedProjects = normalizeAboutProjects(content.aboutProjects)

    return MemberProfileWorkspaceContent(
        profileImageUrl = content.profileImageUrl.trim(),
        profileRole = content.profileRole.trim(),
        profileBio = content.profileBio.trim(),
        aboutHeadline = content.aboutHeadline.trim(),
        aboutRole = content.aboutRole.trim(),
        aboutBio = content.aboutBio.trim(),
        aboutSections = normalizedSections,
        aboutProjectSectionTitle = content.aboutProjectSectionTitle.trim(),
        aboutProjects = normalizedProjects,
        blogTitle = content.blogTitle.trim(),
        homeIntroTitle = content.homeIntroTitle.trim(),
        homeIntroDescription = content.homeIntroDescription.trim(),
        blogDesign = normalizeBlogDesign(content.blogDesign),
        legacyBlogScheme = normalizeLegacyBlogScheme(content.legacyBlogScheme),
        serviceLinks =
            content.serviceLinks.map {
                MemberProfileLinkItem(
                    icon = it.icon.trim(),
                    label = it.label.trim(),
                    href = it.href.trim(),
                )
            },
        contactLinks =
            content.contactLinks.map {
                MemberProfileLinkItem(
                    icon = it.icon.trim(),
                    label = it.label.trim(),
                    href = it.href.trim(),
                )
            },
    )
}

fun encodeMemberProfileWorkspaceContent(content: MemberProfileWorkspaceContent): String =
    Ut.JSON.objectMapper.writeValueAsString(
        MemberProfileWorkspaceContentEnvelope(
            content = normalizeMemberProfileWorkspaceContent(content),
        ),
    )

fun decodeMemberProfileWorkspaceContent(rawValue: String?): MemberProfileWorkspaceContent? {
    if (rawValue.isNullOrBlank()) return null

    val decoded =
        runCatching {
            Ut.JSON.fromString<MemberProfileWorkspaceContentEnvelope>(rawValue).content
        }.getOrNull() ?: return null
    val normalized = normalizeMemberProfileWorkspaceContent(decoded)

    return normalized.takeIf { encodeMemberProfileWorkspaceContent(it) == rawValue }
}

interface MemberHasProfileWorkspace : MemberAware {
    fun getProfileWorkspaceDraftAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(PROFILE_WORKSPACE_DRAFT) {
            loader?.invoke() ?: throw IllegalStateException("profile workspace draft is missing")
        }

    fun getProfileWorkspacePublishedAttr(loader: (() -> MemberAttr)? = null): MemberAttr =
        member.getOrPutAttr(PROFILE_WORKSPACE_PUBLISHED) {
            loader?.invoke() ?: throw IllegalStateException("profile workspace published is missing")
        }

    fun getProfileWorkspaceDraftContent(): MemberProfileWorkspaceContent =
        decodeRequiredProfileWorkspace(getProfileWorkspaceDraftAttr().strValue, PROFILE_WORKSPACE_DRAFT)

    fun getProfileWorkspacePublishedContent(): MemberProfileWorkspaceContent =
        decodeRequiredProfileWorkspace(getProfileWorkspacePublishedAttr().strValue, PROFILE_WORKSPACE_PUBLISHED)

    fun profileWorkspaceDraftModifiedAt(): Instant {
        getProfileWorkspaceDraftContent()
        return getProfileWorkspaceDraftAttr().modifiedAt
    }

    fun profileWorkspacePublishedModifiedAt(): Instant {
        getProfileWorkspacePublishedContent()
        return getProfileWorkspacePublishedAttr().modifiedAt
    }

    val publishedProfileImageUrlVersionedOrDefault: String
        get() {
            if (member.deletedAt != null) return defaultProfileImageUrl()
            val url = getProfileWorkspacePublishedContent().profileImageUrl.takeIf(String::isNotBlank) ?: return defaultProfileImageUrl()
            val separator = if (url.contains("?")) "&" else "?"
            return "$url${separator}v=${profileWorkspacePublishedModifiedAt().toEpochMilli()}"
        }

    fun setProfileWorkspaceDraftContent(content: MemberProfileWorkspaceContent) {
        val raw = encodeMemberProfileWorkspaceContent(content)
        member.getOrPutAttr(PROFILE_WORKSPACE_DRAFT) { MemberAttr(0, member, PROFILE_WORKSPACE_DRAFT, raw) }.strValue = raw
    }

    fun setProfileWorkspacePublishedContent(content: MemberProfileWorkspaceContent) {
        val raw = encodeMemberProfileWorkspaceContent(content)
        member.getOrPutAttr(PROFILE_WORKSPACE_PUBLISHED) { MemberAttr(0, member, PROFILE_WORKSPACE_PUBLISHED, raw) }.strValue = raw
    }
}

private fun decodeRequiredProfileWorkspace(
    raw: String?,
    name: String,
): MemberProfileWorkspaceContent = decodeMemberProfileWorkspaceContent(raw) ?: throw IllegalStateException("$name is missing or invalid")
