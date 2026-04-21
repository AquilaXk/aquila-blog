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
    val serviceLinks: List<MemberProfileLinkItem> = emptyList(),
    val contactLinks: List<MemberProfileLinkItem> = emptyList(),
)

private data class MemberProfileWorkspaceContentEnvelope(
    val content: MemberProfileWorkspaceContent = MemberProfileWorkspaceContent(),
)

private val legacyAboutProjectDefaults =
    mapOf(
        "고구마마켓" to
            MemberProfileAboutProjectBlock(
                name = "고구마마켓",
                summary = "거래 흐름과 상태 전이를 직접 설계하며 커머스 도메인 감각을 다진 프로젝트입니다.",
                role = "Backend · 도메인 설계",
            ),
        "마음-온" to
            MemberProfileAboutProjectBlock(
                name = "마음-온",
                summary = "사용자 감정 기록 흐름을 다루며 서비스 구조와 데이터 설계를 다듬은 프로젝트입니다.",
                role = "Backend · API 설계",
            ),
        "aquila-blog" to
            MemberProfileAboutProjectBlock(
                name = "aquila-blog",
                summary = "글쓰기, 공개 렌더링, 운영 배포까지 직접 관리하는 개인 기술 블로그입니다.",
                role = "Full-stack · Editor/SSR/Deploy",
                href = "https://github.com/AquilaXk/aquila-blog",
                linkLabel = "aquila-blog",
            ),
        "aquila-bank" to
            MemberProfileAboutProjectBlock(
                name = "aquila-bank",
                summary = "금융 도메인을 가정하고 계좌/거래 흐름을 모델링한 학습 프로젝트입니다.",
                role = "Backend · Transaction Flow",
                href = "https://github.com/AquilaXk/aquila-bank",
                linkLabel = "링크 보기",
            ),
    )

private fun normalizeAboutSectionTitle(title: String): String = title.replace(Regex("\\s+"), "").lowercase()

private fun isAboutProjectSection(title: String): Boolean = Regex("프로젝트|project").containsMatchIn(normalizeAboutSectionTitle(title))

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

private fun deriveLegacyAboutProjects(sections: List<MemberProfileAboutSectionBlock>): List<MemberProfileAboutProjectBlock> {
    val projectSection = sections.firstOrNull { isAboutProjectSection(it.title) } ?: return emptyList()
    return normalizeAboutProjects(
        projectSection.items.mapIndexed { index, item ->
            val name = item.trim()
            val preset = legacyAboutProjectDefaults[name]
            if (preset != null) {
                preset.copy(id = "project-${index + 1}")
            } else {
                MemberProfileAboutProjectBlock(id = "project-${index + 1}", name = name)
            }
        },
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
    val legacyProjectSectionTitle = normalizedSections.firstOrNull { isAboutProjectSection(it.title) }?.title.orEmpty()
    val normalizedProjects =
        normalizeAboutProjects(
            content.aboutProjects.ifEmpty {
                deriveLegacyAboutProjects(normalizedSections)
            },
        )

    return MemberProfileWorkspaceContent(
        profileImageUrl = content.profileImageUrl.trim(),
        profileRole = content.profileRole.trim(),
        profileBio = content.profileBio.trim(),
        aboutHeadline = content.aboutHeadline.trim(),
        aboutRole = content.aboutRole.trim(),
        aboutBio = content.aboutBio.trim(),
        aboutSections = normalizedSections,
        aboutProjectSectionTitle = content.aboutProjectSectionTitle.trim().ifBlank { legacyProjectSectionTitle },
        aboutProjects = normalizedProjects,
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
