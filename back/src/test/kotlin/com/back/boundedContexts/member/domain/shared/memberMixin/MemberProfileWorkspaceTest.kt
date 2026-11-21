package com.back.boundedContexts.member.domain.shared.memberMixin

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.member.dto.MemberProfileWorkspaceContentDto
import com.back.standard.util.Ut
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import tools.jackson.module.kotlin.jacksonObjectMapper

class MemberProfileWorkspaceTest {
    init {
        Ut.JSON.objectMapper = jacksonObjectMapper()
    }

    @Test
    fun `canonical draft and published workspaces decode unchanged`() {
        val content = MemberProfileWorkspaceContent(profileImageUrl = "https://cdn.example.com/profile.png")
        val encoded = encodeMemberProfileWorkspaceContent(content)
        val draft = memberWithWorkspace(PROFILE_WORKSPACE_DRAFT, encoded)
        val published = memberWithWorkspace(PROFILE_WORKSPACE_PUBLISHED, encoded)

        assertThat(draft.getProfileWorkspaceDraftContent()).isEqualTo(content)
        assertThat(published.getProfileWorkspacePublishedContent()).isEqualTo(content)
    }

    @Test
    fun `populated canonical workspace preserves sections projects and links in stored and wire JSON`() {
        val content =
            MemberProfileWorkspaceContent(
                aboutSections = listOf(MemberProfileAboutSectionBlock("notes", "Notes", listOf("Engineering"), true)),
                aboutProjectSectionTitle = "Projects",
                aboutProjects =
                    listOf(
                        MemberProfileAboutProjectBlock(
                            "blog",
                            "Aquila Blog",
                            "Technical notes",
                            "Maintainer",
                            "https://example.com/blog",
                            "Read",
                        ),
                    ),
                serviceLinks = listOf(MemberProfileLinkItem("github", "Source", "https://example.com/source")),
                contactLinks = listOf(MemberProfileLinkItem("mail", "Contact", "mailto:owner@example.com")),
            )
        val stored = encodeMemberProfileWorkspaceContent(content)
        val decoded = decodeMemberProfileWorkspaceContent(stored)
        assertThat(decoded).isEqualTo(content)
        val mapper = jacksonObjectMapper()
        val wire = mapper.readTree(mapper.writeValueAsString(MemberProfileWorkspaceContentDto(requireNotNull(decoded))))

        // 응답 DTO가 비어 있지 않은 정본 컬렉션의 필드를 빠뜨리지 않는지 검증한다.
        assertThat(wire.path("aboutSections")).isEqualTo(
            mapper.readTree("""[{"id":"notes","title":"Notes","items":["Engineering"],"dividerBefore":true}]"""),
        )
        assertThat(wire.path("aboutProjectSectionTitle").asText()).isEqualTo("Projects")
        assertThat(wire.path("aboutProjects")).isEqualTo(
            mapper.readTree(
                """[{"id":"blog","name":"Aquila Blog","summary":"Technical notes","role":"Maintainer","href":"https://example.com/blog","linkLabel":"Read"}]""",
            ),
        )
        assertThat(wire.path("serviceLinks")).isEqualTo(
            mapper.readTree("""[{"icon":"github","label":"Source","href":"https://example.com/source"}]"""),
        )
        assertThat(wire.path("contactLinks")).isEqualTo(
            mapper.readTree("""[{"icon":"mail","label":"Contact","href":"mailto:owner@example.com"}]"""),
        )
    }

    @Test
    fun `normalization preserves explicit sections without synthesizing legacy projects`() {
        val section =
            MemberProfileAboutSectionBlock(
                id = "projects",
                title = "Projects",
                items = listOf("aquila-blog"),
            )

        val normalized = normalizeMemberProfileWorkspaceContent(MemberProfileWorkspaceContent(aboutSections = listOf(section)))

        assertThat(normalized.aboutSections).containsExactly(section)
        assertThat(normalized.aboutProjectSectionTitle).isEmpty()
        assertThat(normalized.aboutProjects).isEmpty()
    }

    @Test
    fun `stored project without link label is rejected without repairing its bytes`() {
        val raw =
            encodeMemberProfileWorkspaceContent(
                MemberProfileWorkspaceContent(
                    aboutProjects =
                        listOf(MemberProfileAboutProjectBlock("blog", "Blog", "Notes", "Maintainer", "https://example.com", "Read")),
                ),
            ).replace(",\"linkLabel\":\"Read\"", "")

        // JSON 기본값으로 읽을 수 있어도 손상된 저장 원문을 정상 정본으로 복구해 반환하지 않는다.
        listOf(PROFILE_WORKSPACE_DRAFT, PROFILE_WORKSPACE_PUBLISHED).forEach { name ->
            val member = memberWithWorkspace(name, raw)
            assertThatThrownBy {
                if (name == PROFILE_WORKSPACE_DRAFT) {
                    member.getProfileWorkspaceDraftContent()
                } else {
                    member.getProfileWorkspacePublishedContent()
                }
            }.isInstanceOf(IllegalStateException::class.java)
                .hasMessage("$name is missing or invalid")
            val attr =
                if (name == PROFILE_WORKSPACE_DRAFT) {
                    member.getProfileWorkspaceDraftAttr()
                } else {
                    member.getProfileWorkspacePublishedAttr()
                }
            assertThat(attr.strValue).isEqualTo(raw)
        }
    }

    @Test
    fun `draft workspace rejects malformed stored JSON`() {
        val member = memberWithWorkspace(PROFILE_WORKSPACE_DRAFT, "{malformed")

        assertThatThrownBy(member::getProfileWorkspaceDraftContent)
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage("profileWorkspaceDraft is missing or invalid")
    }

    @Test
    fun `published workspace rejects malformed stored JSON`() {
        val member = memberWithWorkspace(PROFILE_WORKSPACE_PUBLISHED, "{malformed")

        assertThatThrownBy(member::getProfileWorkspacePublishedContent)
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage("profileWorkspacePublished is missing or invalid")
    }

    @Test
    fun `draft workspace rejects decoded but noncanonical stored JSON`() {
        val member = memberWithWorkspace(PROFILE_WORKSPACE_DRAFT, noncanonicalWorkspace())

        assertThatThrownBy(member::getProfileWorkspaceDraftContent)
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage("profileWorkspaceDraft is missing or invalid")
    }

    @Test
    fun `published workspace rejects decoded but noncanonical stored JSON`() {
        val member = memberWithWorkspace(PROFILE_WORKSPACE_PUBLISHED, noncanonicalWorkspace())

        assertThatThrownBy(member::getProfileWorkspacePublishedContent)
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage("profileWorkspacePublished is missing or invalid")
    }

    private fun memberWithWorkspace(
        name: String,
        rawWorkspace: String,
    ): Member =
        Member(1, "member", null, "Member").also { member ->
            member.getOrPutAttr<MemberAttr>(name) { MemberAttr(0, member, name, rawWorkspace) }
        }

    private fun noncanonicalWorkspace(): String {
        val canonical =
            encodeMemberProfileWorkspaceContent(
                MemberProfileWorkspaceContent(profileImageUrl = "https://cdn.example.com/profile.png"),
            )
        return canonical.replace("https://cdn.example.com/profile.png", " https://cdn.example.com/profile.png ")
    }
}
