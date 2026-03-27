package com.back.boundedContexts.member.domain.shared.memberMixin

import com.back.standard.util.Ut

const val PROFILE_WORKSPACE_DRAFT = "profileWorkspaceDraft"
const val PROFILE_WORKSPACE_PUBLISHED = "profileWorkspacePublished"

data class MemberProfileAboutSectionBlock(
    val id: String = "",
    val title: String = "",
    val items: List<String> = emptyList(),
    val dividerBefore: Boolean = false,
)

data class MemberProfileWorkspaceContent(
    val profileImageUrl: String = "",
    val profileRole: String = "",
    val profileBio: String = "",
    val aboutRole: String = "",
    val aboutBio: String = "",
    val aboutSections: List<MemberProfileAboutSectionBlock> = emptyList(),
    val blogTitle: String = "",
    val homeIntroTitle: String = "",
    val homeIntroDescription: String = "",
    val serviceLinks: List<MemberProfileLinkItem> = emptyList(),
    val contactLinks: List<MemberProfileLinkItem> = emptyList(),
)

private data class MemberProfileWorkspaceContentEnvelope(
    val content: MemberProfileWorkspaceContent = MemberProfileWorkspaceContent(),
)

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

    return MemberProfileWorkspaceContent(
        profileImageUrl = content.profileImageUrl.trim(),
        profileRole = content.profileRole.trim(),
        profileBio = content.profileBio.trim(),
        aboutRole = content.aboutRole.trim(),
        aboutBio = content.aboutBio.trim(),
        aboutSections = normalizedSections,
        blogTitle = content.blogTitle.trim(),
        homeIntroTitle = content.homeIntroTitle.trim(),
        homeIntroDescription = content.homeIntroDescription.trim(),
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
    Ut.JSON.toString(
        MemberProfileWorkspaceContentEnvelope(
            content = normalizeMemberProfileWorkspaceContent(content),
        ),
    )

fun decodeMemberProfileWorkspaceContent(rawValue: String?): MemberProfileWorkspaceContent? {
    if (rawValue.isNullOrBlank()) return null

    return runCatching {
        Ut.JSON.fromString<MemberProfileWorkspaceContentEnvelope>(rawValue).content
    }.getOrNull()?.let(::normalizeMemberProfileWorkspaceContent)
}

fun parseLegacyAboutDetailsToBlocks(raw: String): List<MemberProfileAboutSectionBlock> {
    if (raw.isBlank()) return emptyList()

    val lines = raw.split(Regex("\\r?\\n")).map(String::trim)
    val sections = mutableListOf<MemberProfileAboutSectionBlock>()
    var currentTitle: String? = null
    val currentItems = mutableListOf<String>()
    var nextSectionHasDivider = false
    var currentSectionHasDivider = false

    fun pushCurrent() {
        val title = currentTitle?.trim().orEmpty()
        val items = currentItems.map(String::trim).filter(String::isNotBlank)
        if (title.isBlank() && items.isEmpty()) {
            currentTitle = null
            currentItems.clear()
            currentSectionHasDivider = false
            return
        }

        sections.add(
            MemberProfileAboutSectionBlock(
                id = "legacy-${sections.size + 1}",
                title = title,
                items = items,
                dividerBefore = currentSectionHasDivider,
            ),
        )
        currentTitle = null
        currentItems.clear()
        currentSectionHasDivider = false
    }

    lines.forEach { line ->
        if (line.isBlank()) return@forEach

        if (line == "---") {
            pushCurrent()
            nextSectionHasDivider = true
            return@forEach
        }

        val markdownHeadingMatch = Regex("^#{1,3}\\s+(.+)$").matchEntire(line)
        if (markdownHeadingMatch != null) {
            pushCurrent()
            currentTitle = markdownHeadingMatch.groupValues[1].trim()
            currentSectionHasDivider = nextSectionHasDivider
            nextSectionHasDivider = false
            return@forEach
        }

        if (currentTitle == null && currentItems.isEmpty()) {
            currentTitle = line
            currentSectionHasDivider = nextSectionHasDivider
            nextSectionHasDivider = false
            return@forEach
        }

        val plainHeadingLike =
            !line.startsWith("- ") &&
                currentItems.isNotEmpty() &&
                line.length <= 24 &&
                !Regex("\\d{4}[./-]\\d{1,2}").containsMatchIn(line) &&
                !Regex("[,:;)]$").containsMatchIn(line)
        if (plainHeadingLike) {
            pushCurrent()
            currentTitle = line
            currentSectionHasDivider = nextSectionHasDivider
            nextSectionHasDivider = false
            return@forEach
        }

        val itemText =
            if (line.startsWith("- ")) {
                line.removePrefix("- ").trim()
            } else {
                line
            }
        if (itemText.isBlank()) return@forEach
        currentItems.add(itemText)
    }

    pushCurrent()
    return sections
}

fun convertAboutSectionsToLegacyDetails(sections: List<MemberProfileAboutSectionBlock>): String {
    val normalizedSections =
        sections.mapIndexedNotNull { index, section ->
            val normalizedTitle = section.title.trim()
            val normalizedItems =
                section.items
                    .map(String::trim)
                    .filter(String::isNotBlank)
            val hasContent = normalizedTitle.isNotBlank() || normalizedItems.isNotEmpty()
            if (!hasContent) return@mapIndexedNotNull null

            MemberProfileAboutSectionBlock(
                id = section.id.trim().ifBlank { "section-${index + 1}" },
                title = normalizedTitle,
                items = normalizedItems,
                dividerBefore = section.dividerBefore,
            )
        }
    val lines = mutableListOf<String>()

    normalizedSections.forEachIndexed { index, section ->
        if (section.dividerBefore && lines.isNotEmpty()) {
            if (lines.lastOrNull()?.isNotBlank() == true) {
                lines.add("")
            }
            lines.add("---")
            lines.add("")
        } else if (index > 0 && lines.lastOrNull()?.isNotBlank() == true) {
            lines.add("")
        }

        if (section.title.isNotBlank()) {
            lines.add("## ${section.title}")
        }
        section.items.forEach { item ->
            lines.add("- $item")
        }
        lines.add("")
    }

    return lines.dropLastWhile(String::isBlank).joinToString("\n")
}
