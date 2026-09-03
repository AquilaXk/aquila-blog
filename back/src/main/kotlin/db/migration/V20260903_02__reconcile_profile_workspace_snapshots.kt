package db.migration

import org.flywaydb.core.api.migration.BaseJavaMigration
import org.flywaydb.core.api.migration.Context
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.net.URI
import java.sql.Connection
import java.util.Locale

/**
 * Materializes the canonical workspace pair before the runtime legacy projection is removed.
 *
 * The versioned DTOs and normalizers intentionally freeze the cutover-time projection here so
 * replay does not depend on mutable runtime profile code.
 */
@Suppress("ClassName")
class V20260903_02__reconcile_profile_workspace_snapshots : BaseJavaMigration() {
    override fun migrate(context: Context) {
        val connection = context.connection
        connection.createStatement().use { statement ->
            statement.execute("SET LOCAL statement_timeout = '30s'")
            statement.execute("SET LOCAL lock_timeout = '5s'")
            statement.execute("LOCK TABLE member IN SHARE ROW EXCLUSIVE MODE")
            statement.execute("LOCK TABLE member_attr IN SHARE ROW EXCLUSIVE MODE")
        }

        val members = readActiveMembers(connection)
        val inserts = mutableListOf<WorkspaceInsert>()

        members.forEach { member ->
            val draft = member.attrs[PROFILE_WORKSPACE_DRAFT]
            val published = member.attrs[PROFILE_WORKSPACE_PUBLISHED]
            when {
                draft == null && published == null -> {
                    val raw = encodeWorkspace(projectLegacy(member.attrs))
                    requireCanonical(raw)
                    inserts += WorkspaceInsert(member.id, PROFILE_WORKSPACE_DRAFT, raw)
                    inserts += WorkspaceInsert(member.id, PROFILE_WORKSPACE_PUBLISHED, raw)
                }

                draft != null && published != null -> {
                    requireCanonical(draft)
                    requireCanonical(published)
                }

                else -> throw IllegalStateException("profile workspace pair is partial")
            }
        }

        if (inserts.isNotEmpty()) {
            connection
                .prepareStatement(
                    "INSERT INTO member_attr (subject_id, name, str_value) VALUES (?, ?, ?)",
                ).use { statement ->
                    inserts.forEach { insert ->
                        statement.setLong(1, insert.memberId)
                        statement.setString(2, insert.name)
                        statement.setString(3, insert.raw)
                        if (statement.executeUpdate() != 1) {
                            throw IllegalStateException("profile workspace insert drift")
                        }
                    }
                }
        }

        verifyResult(connection, members, inserts)
    }

    private fun readActiveMembers(connection: Connection): List<MemberRow> {
        val attrsByMember = linkedMapOf<Long, MutableMap<String, String>>()
        connection
            .prepareStatement(
                """
                SELECT m.id, a.name, a.str_value
                FROM member m
                LEFT JOIN member_attr a ON a.subject_id = m.id AND a.name IN (${PROFILE_ATTR_NAMES.joinToString(",") { "'$it'" }})
                WHERE m.deleted_at IS NULL
                ORDER BY m.id ASC, a.name ASC
                """.trimIndent(),
            ).use { statement ->
                statement.executeQuery().use { rows ->
                    while (rows.next()) {
                        val id = rows.getLong("id")
                        val attrs = attrsByMember.getOrPut(id) { linkedMapOf() }
                        val name = rows.getString("name") ?: continue
                        val value = rows.getString("str_value")
                        if (attrs.put(name, value ?: "") != null) {
                            throw IllegalStateException("profile attribute duplicate")
                        }
                    }
                }
            }
        return attrsByMember.map { (id, attrs) -> MemberRow(id, attrs) }
    }

    private fun verifyResult(
        connection: Connection,
        originalMembers: List<MemberRow>,
        inserts: List<WorkspaceInsert>,
    ) {
        val expectedNewRaw = inserts.associateBy({ it.memberId to it.name }, WorkspaceInsert::raw)
        val result = readActiveMembers(connection)
        if (result.size != originalMembers.size) throw IllegalStateException("active member drift")
        result.zip(originalMembers).forEach { (after, before) ->
            if (after.id != before.id) throw IllegalStateException("active member order drift")
            val draft =
                after.attrs[PROFILE_WORKSPACE_DRAFT]
                    ?: throw IllegalStateException("profile draft missing")
            val published =
                after.attrs[PROFILE_WORKSPACE_PUBLISHED]
                    ?: throw IllegalStateException("profile published missing")
            requireCanonical(draft)
            requireCanonical(published)
            listOf(PROFILE_WORKSPACE_DRAFT, PROFILE_WORKSPACE_PUBLISHED).forEach { name ->
                val beforeRaw = before.attrs[name]
                val expectedRaw = expectedNewRaw[after.id to name]
                when {
                    beforeRaw != null && after.attrs[name] != beforeRaw -> {
                        throw IllegalStateException("existing workspace changed")
                    }

                    expectedRaw != null && after.attrs[name] != expectedRaw -> {
                        throw IllegalStateException("workspace insert mismatch")
                    }
                }
            }
            if (expectedNewRaw[after.id to PROFILE_WORKSPACE_DRAFT] != null && draft != published) {
                throw IllegalStateException("new profile workspace pair diverged")
            }
        }
        if (expectedNewRaw.size != inserts.size) {
            throw IllegalStateException("profile workspace insert accounting drift")
        }
    }

    private fun requireCanonical(raw: String) {
        if (raw.isBlank()) throw IllegalStateException("profile workspace is blank")
        val decoded = decodeWorkspace(raw) ?: throw IllegalStateException("profile workspace is invalid")
        if (encodeWorkspace(decoded) != raw) {
            throw IllegalStateException("profile workspace is noncanonical")
        }
    }

    private fun projectLegacy(attrs: Map<String, String>): WorkspaceContentV20260903 =
        normalizeWorkspace(
            WorkspaceContentV20260903(
                profileImageUrl = attrs[PROFILE_IMG_URL].orEmpty(),
                profileRole = attrs[PROFILE_ROLE].orEmpty(),
                profileBio = attrs[PROFILE_BIO].orEmpty(),
                aboutRole = attrs[ABOUT_ROLE].orEmpty(),
                aboutBio = attrs[ABOUT_BIO].orEmpty(),
                aboutSections = parseAboutDetails(attrs[ABOUT_DETAILS].orEmpty()),
                blogTitle = attrs[BLOG_TITLE].orEmpty(),
                homeIntroTitle = attrs[HOME_INTRO_TITLE].orEmpty(),
                homeIntroDescription = attrs[HOME_INTRO_DESCRIPTION].orEmpty(),
                blogDesign = attrs[BLOG_DESIGN].orEmpty(),
                legacyBlogScheme = attrs[LEGACY_BLOG_SCHEME].orEmpty(),
                serviceLinks = parseLinks(attrs[PROFILE_SERVICE_LINKS].orEmpty(), "service", SERVICE_ICONS),
                contactLinks = parseLinks(attrs[PROFILE_CONTACT_LINKS].orEmpty(), "message", CONTACT_ICONS),
            ),
        )

    private fun encodeWorkspace(content: WorkspaceContentV20260903): String =
        OBJECT_MAPPER.writeValueAsString(
            WorkspaceEnvelopeV20260903(content = normalizeWorkspace(content)),
        )

    private fun decodeWorkspace(raw: String): WorkspaceContentV20260903? =
        runCatching {
            OBJECT_MAPPER.readValue(raw, WorkspaceEnvelopeV20260903::class.java).content
        }.getOrNull()?.let(::normalizeWorkspace)

    private fun normalizeWorkspace(content: WorkspaceContentV20260903): WorkspaceContentV20260903 {
        val normalizedSections =
            content.aboutSections.mapIndexedNotNull { index, section ->
                val title = section.title.trim()
                val items = section.items.map(String::trim).filter(String::isNotBlank)
                if (title.isBlank() && items.isEmpty()) return@mapIndexedNotNull null
                AboutSectionV20260903(
                    id = section.id.trim().ifBlank { "section-${index + 1}" },
                    title = title,
                    items = items,
                    dividerBefore = section.dividerBefore,
                )
            }
        val legacyProjectSectionTitle =
            normalizedSections.firstOrNull { isProjectSection(it.title) }?.title.orEmpty()
        val normalizedProjects =
            normalizeProjects(
                content.aboutProjects.ifEmpty { deriveLegacyProjects(normalizedSections) },
            )
        val visibleSections =
            if (normalizedProjects.isNotEmpty()) {
                normalizedSections.filterNot { isProjectSection(it.title) }
            } else {
                normalizedSections
            }

        return WorkspaceContentV20260903(
            profileImageUrl = content.profileImageUrl.trim(),
            profileRole = content.profileRole.trim(),
            profileBio = content.profileBio.trim(),
            aboutHeadline = content.aboutHeadline.trim(),
            aboutRole = content.aboutRole.trim(),
            aboutBio = content.aboutBio.trim(),
            aboutSections = visibleSections,
            aboutProjectSectionTitle = content.aboutProjectSectionTitle.trim().ifBlank { legacyProjectSectionTitle },
            aboutProjects = normalizedProjects,
            blogTitle = content.blogTitle.trim(),
            homeIntroTitle = content.homeIntroTitle.trim(),
            homeIntroDescription = content.homeIntroDescription.trim(),
            blogDesign = normalizeBlogDesign(content.blogDesign),
            legacyBlogScheme = normalizeLegacyBlogScheme(content.legacyBlogScheme),
            serviceLinks = content.serviceLinks.map(::normalizeCanonicalLink),
            contactLinks = content.contactLinks.map(::normalizeCanonicalLink),
        )
    }

    private fun normalizeCanonicalLink(link: LinkItemV20260903): LinkItemV20260903 =
        LinkItemV20260903(
            icon = link.icon.trim(),
            label = link.label.trim(),
            href = link.href.trim(),
        )

    private fun normalizeProjects(projects: List<AboutProjectV20260903>): List<AboutProjectV20260903> =
        projects.mapIndexedNotNull { index, project ->
            val name = project.name.trim()
            val summary = project.summary.trim()
            val role = project.role.trim()
            val href = project.href.trim()
            val linkLabel = project.linkLabel.trim()
            if (name.isBlank() && summary.isBlank() && role.isBlank() && href.isBlank()) {
                return@mapIndexedNotNull null
            }
            AboutProjectV20260903(
                id = project.id.trim().ifBlank { "project-${index + 1}" },
                name = name,
                summary = summary,
                role = role,
                href = href,
                linkLabel = linkLabel.ifBlank { if (href.isBlank()) "" else "링크 보기" },
            )
        }

    private fun deriveLegacyProjects(sections: List<AboutSectionV20260903>): List<AboutProjectV20260903> {
        val projectSection = sections.firstOrNull { isProjectSection(it.title) } ?: return emptyList()
        return normalizeProjects(
            projectSection.items.mapIndexed { index, item ->
                val name = item.trim()
                LEGACY_PROJECT_DEFAULTS[name]?.copy(id = "project-${index + 1}")
                    ?: AboutProjectV20260903(id = "project-${index + 1}", name = name)
            },
        )
    }

    private fun isProjectSection(title: String): Boolean =
        Regex("프로젝트|project").containsMatchIn(title.replace(Regex("\\s+"), "").lowercase())

    private fun normalizeBlogDesign(value: String?): String = if (value?.trim()?.lowercase() == "grid") "grid" else "legacy"

    private fun normalizeLegacyBlogScheme(value: String?): String = if (value?.trim()?.lowercase() == "light") "light" else "dark"

    private fun parseAboutDetails(raw: String): List<AboutSectionV20260903> {
        if (raw.isBlank()) return emptyList()
        val sections = mutableListOf<AboutSectionV20260903>()
        var title: String? = null
        val items = mutableListOf<String>()
        var nextDivider = false
        var divider = false

        fun flush() {
            val normalizedTitle = title?.trim().orEmpty()
            val normalizedItems = items.map(String::trim).filter(String::isNotBlank)
            if (normalizedTitle.isNotBlank() || normalizedItems.isNotEmpty()) {
                sections +=
                    AboutSectionV20260903(
                        id = "legacy-${sections.size + 1}",
                        title = normalizedTitle,
                        items = normalizedItems,
                        dividerBefore = divider,
                    )
            }
            title = null
            items.clear()
            divider = false
        }
        raw.split(Regex("\\r?\\n")).map(String::trim).forEach { line ->
            when {
                line.isBlank() -> Unit
                line == "---" -> {
                    flush()
                    nextDivider = true
                }

                Regex("^#{1,3}\\s+(.+)$").matches(line) -> {
                    flush()
                    title = line.replace(Regex("^#{1,3}\\s+"), "")
                    divider = nextDivider
                    nextDivider = false
                }

                title == null && items.isEmpty() -> {
                    title = line
                    divider = nextDivider
                    nextDivider = false
                }

                isPlainHeading(line, items) -> {
                    flush()
                    title = line
                    divider = nextDivider
                    nextDivider = false
                }

                else -> items += line.removePrefix("- ").trim()
            }
        }
        flush()
        return sections
    }

    private fun isPlainHeading(
        line: String,
        currentItems: List<String>,
    ): Boolean =
        !line.startsWith("- ") &&
            currentItems.isNotEmpty() &&
            line.length <= 24 &&
            !Regex("\\d{4}[./-]\\d{1,2}").containsMatchIn(line) &&
            !Regex("[,:;)]$").containsMatchIn(line)

    private fun parseLinks(
        raw: String,
        defaultIcon: String,
        allowedIcons: Set<String>,
    ): List<LinkItemV20260903> {
        if (raw.isBlank()) return emptyList()
        val nodes = runCatching { OBJECT_MAPPER.readTree(raw).path("items") }.getOrNull() ?: return emptyList()
        if (!nodes.isArray) return emptyList()
        return nodes.mapNotNull { node ->
            val label = node.path("label").stringValue("").trim()
            val href =
                normalizeHref(node.path("href").stringValue(""))
                    ?: return@mapNotNull null
            if (label.isBlank() || href.isBlank()) return@mapNotNull null
            val icon =
                node
                    .path("icon")
                    .stringValue("")
                    .trim()
                    .ifBlank { defaultIcon }
                    .let { if (it in allowedIcons) it else defaultIcon }
            LinkItemV20260903(icon, label, href)
        }
    }

    private fun normalizeHref(raw: String): String? {
        val href = raw.trim()
        if (href.isBlank()) return ""
        if (href.any { it == '\r' || it == '\n' }) return null
        if (href.startsWith("/")) return href.takeUnless { it.startsWith("//") }
        val scheme = runCatching { URI(href).scheme?.lowercase(Locale.ROOT) }.getOrNull() ?: return null
        return href.takeIf { scheme in ALLOWED_LINK_SCHEMES }
    }

    private data class MemberRow(
        val id: Long,
        val attrs: Map<String, String>,
    )

    private data class WorkspaceInsert(
        val memberId: Long,
        val name: String,
        val raw: String,
    )

    private companion object {
        private val OBJECT_MAPPER = jacksonObjectMapper()
        private const val PROFILE_IMG_URL = "profileImgUrl"
        private const val PROFILE_ROLE = "profileRole"
        private const val PROFILE_BIO = "profileBio"
        private const val ABOUT_ROLE = "aboutRole"
        private const val ABOUT_BIO = "aboutBio"
        private const val ABOUT_DETAILS = "aboutDetails"
        private const val BLOG_TITLE = "blogTitle"
        private const val HOME_INTRO_TITLE = "homeIntroTitle"
        private const val HOME_INTRO_DESCRIPTION = "homeIntroDescription"
        private const val BLOG_DESIGN = "blogDesign"
        private const val LEGACY_BLOG_SCHEME = "legacyBlogScheme"
        private const val PROFILE_SERVICE_LINKS = "profileServiceLinks"
        private const val PROFILE_CONTACT_LINKS = "profileContactLinks"
        private const val PROFILE_WORKSPACE_DRAFT = "profileWorkspaceDraft"
        private const val PROFILE_WORKSPACE_PUBLISHED = "profileWorkspacePublished"
        private val PROFILE_ATTR_NAMES =
            listOf(
                PROFILE_IMG_URL,
                PROFILE_ROLE,
                PROFILE_BIO,
                ABOUT_ROLE,
                ABOUT_BIO,
                ABOUT_DETAILS,
                BLOG_TITLE,
                HOME_INTRO_TITLE,
                HOME_INTRO_DESCRIPTION,
                BLOG_DESIGN,
                LEGACY_BLOG_SCHEME,
                PROFILE_SERVICE_LINKS,
                PROFILE_CONTACT_LINKS,
                PROFILE_WORKSPACE_DRAFT,
                PROFILE_WORKSPACE_PUBLISHED,
            )
        private val SERVICE_ICONS =
            setOf("service", "briefcase", "laptop", "rocket", "spark", "search", "tag", "camera", "question")
        private val CONTACT_ICONS =
            setOf("github", "linkedin", "mail", "message", "kakao", "instagram", "globe", "link", "phone", "bell")
        private val ALLOWED_LINK_SCHEMES = setOf("https", "http", "mailto", "tel")
        private val LEGACY_PROJECT_DEFAULTS =
            mapOf(
                "고구마마켓" to
                    AboutProjectV20260903(
                        name = "고구마마켓",
                        summary = "거래 흐름과 상태 전이를 직접 설계하며 커머스 도메인 감각을 다진 프로젝트입니다.",
                        role = "Backend · 도메인 설계",
                    ),
                "마음-온" to
                    AboutProjectV20260903(
                        name = "마음-온",
                        summary = "사용자 감정 기록 흐름을 다루며 서비스 구조와 데이터 설계를 다듬은 프로젝트입니다.",
                        role = "Backend · API 설계",
                    ),
                "aquila-blog" to
                    AboutProjectV20260903(
                        name = "aquila-blog",
                        summary = "글쓰기, 공개 렌더링, 운영 배포까지 직접 관리하는 개인 기술 블로그입니다.",
                        role = "Full-stack · Editor/SSR/Deploy",
                        href = "https://github.com/AquilaXk/aquila-blog",
                        linkLabel = "aquila-blog",
                    ),
                "aquila-bank" to
                    AboutProjectV20260903(
                        name = "aquila-bank",
                        summary = "금융 도메인을 가정하고 계좌/거래 흐름을 모델링한 학습 프로젝트입니다.",
                        role = "Backend · Transaction Flow",
                        href = "https://github.com/AquilaXk/aquila-bank",
                        linkLabel = "링크 보기",
                    ),
            )
    }
}

private data class AboutSectionV20260903(
    val id: String = "",
    val title: String = "",
    val items: List<String> = emptyList(),
    val dividerBefore: Boolean = false,
)

private data class AboutProjectV20260903(
    val id: String = "",
    val name: String = "",
    val summary: String = "",
    val role: String = "",
    val href: String = "",
    val linkLabel: String = "",
)

private data class LinkItemV20260903(
    val icon: String = "service",
    val label: String = "",
    val href: String = "",
)

private data class WorkspaceContentV20260903(
    val profileImageUrl: String = "",
    val profileRole: String = "",
    val profileBio: String = "",
    val aboutHeadline: String = "",
    val aboutRole: String = "",
    val aboutBio: String = "",
    val aboutSections: List<AboutSectionV20260903> = emptyList(),
    val aboutProjectSectionTitle: String = "",
    val aboutProjects: List<AboutProjectV20260903> = emptyList(),
    val blogTitle: String = "",
    val homeIntroTitle: String = "",
    val homeIntroDescription: String = "",
    val blogDesign: String = "legacy",
    val legacyBlogScheme: String = "dark",
    val serviceLinks: List<LinkItemV20260903> = emptyList(),
    val contactLinks: List<LinkItemV20260903> = emptyList(),
)

private data class WorkspaceEnvelopeV20260903(
    val content: WorkspaceContentV20260903 = WorkspaceContentV20260903(),
)
