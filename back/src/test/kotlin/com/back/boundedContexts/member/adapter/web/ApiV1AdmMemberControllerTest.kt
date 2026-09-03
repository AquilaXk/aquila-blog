package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.support.BaseControllerIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put

@org.junit.jupiter.api.DisplayName("ApiV1AdmMemberController 테스트")
class ApiV1AdmMemberControllerTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Test
    @WithUserDetails("admin@test.com")
    fun `관리자는 canonical profile workspace bootstrap을 조회할 수 있다`() {
        val admin = memberFacade.findByEmail("admin@test.com")!!

        mvc
            .get("/member/api/v1/adm/members/profile/bootstrap")
            .andExpect {
                status { isOk() }
                jsonPath("$.member.id") { value(admin.id) }
                jsonPath("$.workspace.draft") { exists() }
                jsonPath("$.workspace.published") { exists() }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `legacy profile image and card mutation routes are absent`() {
        val admin = memberFacade.findByEmail("admin@test.com")!!

        mvc
            .patch("/member/api/v1/adm/members/${admin.id}/profileImgUrl") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"profileImgUrl":"https://example.com/legacy.png"}"""
            }.andExpect {
                status { isNotFound() }
            }
        mvc
            .patch("/member/api/v1/adm/members/${admin.id}/profileCard") {
                contentType = MediaType.APPLICATION_JSON
                content = "{}"
            }.andExpect {
                status { isNotFound() }
            }
    }

    @Test
    @WithUserDetails("admin@test.com")
    fun `draft is isolated from published until canonical publish`() {
        val admin = memberFacade.findByEmail("admin@test.com")!!
        val publishedRole = admin.getProfileWorkspacePublishedContent().profileRole

        mvc
            .put("/member/api/v1/adm/members/${admin.id}/profileWorkspace/draft") {
                contentType = MediaType.APPLICATION_JSON
                content = canonicalWorkspacePayload("Platform Engineer")
            }.andExpect {
                status { isOk() }
                jsonPath("$.draft.profileRole") { value("Platform Engineer") }
                jsonPath("$.published.profileRole") { value(publishedRole) }
                jsonPath("$.dirtyFromPublished") { value(true) }
            }

        mvc
            .post("/member/api/v1/adm/members/${admin.id}/profileWorkspace/publish")
            .andExpect {
                status { isOk() }
                jsonPath("$.published.profileRole") { value("Platform Engineer") }
                jsonPath("$.dirtyFromPublished") { value(false) }
            }
        assertThat(
            memberFacade
                .findById(admin.id)
                .orElseThrow()
                .getProfileWorkspacePublishedContent()
                .profileRole,
        ).isEqualTo("Platform Engineer")
    }

    private fun canonicalWorkspacePayload(role: String): String =
        """
        {
          "profileImageUrl":"",
          "profileRole":"$role",
          "profileBio":"",
          "aboutHeadline":"",
          "aboutRole":"",
          "aboutBio":"",
          "aboutSections":[],
          "aboutProjectSectionTitle":"",
          "aboutProjects":[],
          "blogTitle":"",
          "homeIntroTitle":"",
          "homeIntroDescription":"",
          "blogDesign":"legacy",
          "legacyBlogScheme":"dark",
          "serviceLinks":[],
          "contactLinks":[]
        }
        """.trimIndent()
}
