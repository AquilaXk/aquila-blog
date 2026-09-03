package com.back.boundedContexts.member.domain.shared.memberMixin

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
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
