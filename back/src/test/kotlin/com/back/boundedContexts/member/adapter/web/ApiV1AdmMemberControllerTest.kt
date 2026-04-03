package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.support.SeededSpringBootTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler
import org.springframework.transaction.annotation.Transactional

@ActiveProfiles("test")
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@org.junit.jupiter.api.DisplayName("ApiV1AdmMemberController 테스트")
class ApiV1AdmMemberControllerTest : SeededSpringBootTestSupport() {
    @Autowired
    private lateinit var mvc: MockMvc

    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Test
    @WithUserDetails("admin@test.com")
    fun `관리자는 허브 bootstrap에서 현재 세션과 공개 프로필 snapshot을 함께 조회할 수 있다`() {
        val admin = memberFacade.findByEmail("admin@test.com")!!

        mvc
            .get("/member/api/v1/adm/members/bootstrap")
            .andExpect {
                status { isOk() }
                jsonPath("$.member.id") { value(admin.id) }
                jsonPath("$.member.isAdmin") { value(true) }
                jsonPath("$.member.nickname") { value(admin.nickname) }
                jsonPath("$.profile.username") { value(admin.name) }
                jsonPath("$.profile.name") { value(admin.name) }
                jsonPath("$.profile.nickname") { value(admin.nickname) }
                jsonPath("$.profile.blogTitle") { value(admin.blogTitle) }
            }
    }

    @Nested
    inner class UpdateProfileCard {
        @Test
        @WithUserDetails("admin@test.com")
        fun `관리자는 회원 프로필 카드와 메인 소개 카드를 함께 수정할 수 있다`() {
            val member = memberFacade.findByEmail("admin@test.com")!!
            val newRole = "Backend Developer"
            val newBio = "블로그 운영자 소개 문구"
            val newAboutRole = "Platform Engineer"
            val newAboutBio = "About 페이지에서 노출할 소개 문구"
            val newAboutDetails = "## 경력\n- 2024.03 플랫폼 운영/개발"
            val newAboutDetailsPayload = "## 경력\\n- 2024.03 플랫폼 운영/개발"
            val newBlogTitle = "aquilaXk's Archive"
            val newIntroTitle = "aquilaXk's Backend Log"
            val newIntroDescription = "실전 백엔드 운영과 개발 메모를 남기는 공간입니다."
            val newServiceLabel = "aquila-blog"
            val newServiceHref = "https://github.com/AquilaXk/aquila-blog"
            val newContactLabel = "email"
            val newContactHref = "mailto:admin@example.com"

            mvc
                .patch("/member/api/v1/adm/members/${member.id}/profileCard") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "role": "$newRole",
                            "bio": "$newBio",
                            "aboutRole": "$newAboutRole",
                            "aboutBio": "$newAboutBio",
                            "aboutDetails": "$newAboutDetailsPayload",
                            "blogTitle": "$newBlogTitle",
                            "homeIntroTitle": "$newIntroTitle",
                            "homeIntroDescription": "$newIntroDescription",
                            "serviceLinks": [
                                {"icon": "service", "label": "$newServiceLabel", "href": "$newServiceHref"}
                            ],
                            "contactLinks": [
                                {"icon": "mail", "label": "$newContactLabel", "href": "$newContactHref"}
                            ]
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1AdmMemberController::class.java))
                    match(handler().methodName("updateProfileCard"))
                    jsonPath("$.id") { value(member.id) }
                    jsonPath("$.profileRole") { value(newRole) }
                    jsonPath("$.profileBio") { value(newBio) }
                    jsonPath("$.aboutRole") { value(newAboutRole) }
                    jsonPath("$.aboutBio") { value(newAboutBio) }
                    jsonPath("$.aboutDetails") { value(newAboutDetails) }
                    jsonPath("$.blogTitle") { value(newBlogTitle) }
                    jsonPath("$.homeIntroTitle") { value(newIntroTitle) }
                    jsonPath("$.homeIntroDescription") { value(newIntroDescription) }
                    jsonPath("$.serviceLinks[0].label") { value(newServiceLabel) }
                    jsonPath("$.serviceLinks[0].href") { value(newServiceHref) }
                    jsonPath("$.contactLinks[0].label") { value(newContactLabel) }
                    jsonPath("$.contactLinks[0].href") { value(newContactHref) }
                }

            val updatedMember = memberFacade.findById(member.id).orElseThrow()
            assertThat(updatedMember.profileRole).isEqualTo(newRole)
            assertThat(updatedMember.profileBio).isEqualTo(newBio)
            assertThat(updatedMember.aboutRole).isEqualTo(newAboutRole)
            assertThat(updatedMember.aboutBio).isEqualTo(newAboutBio)
            assertThat(updatedMember.aboutDetails).isEqualTo(newAboutDetails)
            assertThat(updatedMember.blogTitle).isEqualTo(newBlogTitle)
            assertThat(updatedMember.homeIntroTitle).isEqualTo(newIntroTitle)
            assertThat(updatedMember.homeIntroDescription).isEqualTo(newIntroDescription)
            assertThat(updatedMember.serviceLinks).hasSize(1)
            assertThat(updatedMember.serviceLinks[0].label).isEqualTo(newServiceLabel)
            assertThat(updatedMember.serviceLinks[0].href).isEqualTo(newServiceHref)
            assertThat(updatedMember.contactLinks).hasSize(1)
            assertThat(updatedMember.contactLinks[0].label).isEqualTo(newContactLabel)
            assertThat(updatedMember.contactLinks[0].href).isEqualTo(newContactHref)
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `관리자 상세 조회는 저장된 about 정보를 다시 비우지 않는다`() {
            val member = memberFacade.findByEmail("admin@test.com")!!
            val aboutRole = "Tech Lead"
            val aboutBio = "운영과 구조 설명을 담는 소개"
            val aboutDetails = "## 수상이력\n- 2025.03 플랫폼 안정화"
            val aboutDetailsPayload = "## 수상이력\\n- 2025.03 플랫폼 안정화"

            mvc
                .patch("/member/api/v1/adm/members/${member.id}/profileCard") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "role": "Backend Developer",
                            "bio": "bio",
                            "aboutRole": "$aboutRole",
                            "aboutBio": "$aboutBio",
                            "aboutDetails": "$aboutDetailsPayload",
                            "blogTitle": "blog",
                            "homeIntroTitle": "title",
                            "homeIntroDescription": "description",
                            "serviceLinks": [],
                            "contactLinks": []
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isOk() }
                }

            mvc
                .get("/member/api/v1/adm/members/${member.id}")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.aboutRole") { value(aboutRole) }
                    jsonPath("$.aboutBio") { value(aboutBio) }
                    jsonPath("$.aboutDetails") { value(aboutDetails) }
                }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `관리자는 서비스와 연락처 링크를 모두 비운 상태로 저장할 수 있다`() {
            val member = memberFacade.findByEmail("admin@test.com")!!

            mvc
                .patch("/member/api/v1/adm/members/${member.id}/profileCard") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "role": "Backend Developer",
                            "bio": "bio",
                            "homeIntroTitle": "title",
                            "homeIntroDescription": "description",
                            "serviceLinks": [],
                            "contactLinks": []
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.serviceLinks.length()") { value(0) }
                    jsonPath("$.contactLinks.length()") { value(0) }
                }

            val updatedMember = memberFacade.findById(member.id).orElseThrow()
            assertThat(updatedMember.serviceLinks).isEmpty()
            assertThat(updatedMember.contactLinks).isEmpty()
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `서비스 링크 아이콘이 허용 목록에 없으면 400을 반환한다`() {
            val member = memberFacade.findByEmail("admin@test.com")!!

            mvc
                .patch("/member/api/v1/adm/members/${member.id}/profileCard") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "role": "role",
                            "bio": "bio",
                            "homeIntroTitle": "title",
                            "homeIntroDescription": "description",
                            "serviceLinks": [
                                {"icon": "unknown-icon", "label": "서비스", "href": "https://example.com"}
                            ],
                            "contactLinks": []
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-1") }
                    jsonPath("$.msg") { value(containsString("serviceLinks[0].icon")) }
                }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `연락처 링크 아이콘이 비어 있으면 contact 기본 아이콘으로 저장된다`() {
            val member = memberFacade.findByEmail("admin@test.com")!!

            mvc
                .patch("/member/api/v1/adm/members/${member.id}/profileCard") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "role": "role",
                            "bio": "bio",
                            "homeIntroTitle": "title",
                            "homeIntroDescription": "description",
                            "serviceLinks": [],
                            "contactLinks": [
                                {"icon": "", "label": "email", "href": "mailto:admin@example.com"}
                            ]
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.contactLinks[0].icon") { value("message") }
                }

            val updatedMember = memberFacade.findById(member.id).orElseThrow()
            assertThat(updatedMember.contactLinks).hasSize(1)
            assertThat(updatedMember.contactLinks[0].icon).isEqualTo("message")
        }

        @Test
        @WithUserDetails("user1@test.com")
        fun `프로필 카드 수정에서 일반 사용자는 403을 반환한다`() {
            mvc
                .patch("/member/api/v1/adm/members/1/profileCard") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "role": "role",
                            "bio": "bio",
                            "homeIntroTitle": "title",
                            "homeIntroDescription": "description"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isForbidden() }
                    jsonPath("$.resultCode") { value("403-1") }
                    jsonPath("$.msg") { value("권한이 없습니다.") }
                }
        }
    }

    @Nested
    inner class ProfileWorkspace {
        @Test
        @WithUserDetails("admin@test.com")
        fun `관리자는 프로필 워크스페이스 초안을 저장할 수 있다`() {
            val member = memberFacade.findByEmail("admin@test.com")!!
            val previousPublishedRole = member.profileRole

            mvc
                .put("/member/api/v1/adm/members/${member.id}/profileWorkspace/draft") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "profileImageUrl": "",
                            "profileRole": "Platform Engineer",
                            "profileBio": "초안 프로필 소개",
                            "aboutRole": "Architecture Writer",
                            "aboutBio": "About 초안 소개",
                            "aboutSections": [
                                {
                                    "id": "career",
                                    "title": "경력",
                                    "items": ["2026.03 Aquila Blog 운영", "2025.11 관측성 체계 정리"],
                                    "dividerBefore": false
                                }
                            ],
                            "blogTitle": "Aquila Workspace",
                            "homeIntroTitle": "프로필 워크스페이스 실험실",
                            "homeIntroDescription": "브랜드와 소개 문구를 분리 관리합니다.",
                            "serviceLinks": [
                                {"icon": "service", "label": "github", "href": "https://github.com/AquilaXk/aquila-blog"}
                            ],
                            "contactLinks": [
                                {"icon": "mail", "label": "email", "href": "mailto:admin@example.com"}
                            ]
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.draft.profileRole") { value("Platform Engineer") }
                    jsonPath("$.draft.aboutSections.length()") { value(1) }
                    jsonPath("$.draft.aboutSections[0].title") { value("경력") }
                    jsonPath("$.published.profileRole") { value(previousPublishedRole) }
                    jsonPath("$.dirtyFromPublished") { value(true) }
                }

            val updatedMember = memberFacade.findById(member.id).orElseThrow()
            assertThat(updatedMember.profileRole).isEqualTo("Platform Engineer")
            assertThat(updatedMember.profileBio).isEqualTo("초안 프로필 소개")
            assertThat(updatedMember.aboutRole).isEqualTo("Architecture Writer")
            assertThat(updatedMember.aboutBio).isEqualTo("About 초안 소개")
            assertThat(updatedMember.aboutDetails).contains("## 경력")
            assertThat(updatedMember.aboutDetails).contains("- 2026.03 Aquila Blog 운영")
            assertThat(updatedMember.blogTitle).isEqualTo("Aquila Workspace")
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `draft 저장 후 공개 관리자 프로필은 발행 전까지 기존 공개본을 유지하고 publish 후 반영된다`() {
            val member = memberFacade.findByEmail("admin@test.com")!!
            val previousPublishedRole = member.profileRole
            val previousPublishedBlogTitle = member.blogTitle

            mvc
                .put("/member/api/v1/adm/members/${member.id}/profileWorkspace/draft") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "profileImageUrl": "",
                            "profileRole": "Draft Role",
                            "profileBio": "Draft Bio",
                            "aboutRole": "Draft About Role",
                            "aboutBio": "Draft About Bio",
                            "aboutSections": [
                                {
                                    "id": "awards",
                                    "title": "수상이력",
                                    "items": ["2026.03 운영 포트폴리오 고도화"],
                                    "dividerBefore": false
                                }
                            ],
                            "blogTitle": "Draft Blog Title",
                            "homeIntroTitle": "Draft Intro Title",
                            "homeIntroDescription": "Draft Intro Description",
                            "serviceLinks": [],
                            "contactLinks": []
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isOk() }
                }

            mvc
                .get("/member/api/v1/members/adminProfile")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.profileRole") { value(previousPublishedRole) }
                    jsonPath("$.blogTitle") { value(previousPublishedBlogTitle) }
                }

            mvc
                .post("/member/api/v1/adm/members/${member.id}/profileWorkspace/publish")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.published.profileRole") { value("Draft Role") }
                    jsonPath("$.dirtyFromPublished") { value(false) }
                }

            mvc
                .get("/member/api/v1/members/adminProfile")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.profileRole") { value("Draft Role") }
                    jsonPath("$.profileBio") { value("Draft Bio") }
                    jsonPath("$.aboutRole") { value("Draft About Role") }
                    jsonPath("$.aboutSections.length()") { value(1) }
                    jsonPath("$.aboutSections[0].title") { value("수상이력") }
                    jsonPath("$.blogTitle") { value("Draft Blog Title") }
                    jsonPath("$.homeIntroTitle") { value("Draft Intro Title") }
                }
        }
    }

    @Nested
    inner class UpdateProfileImg {
        @Test
        @WithUserDetails("admin@test.com")
        fun `관리자는 회원 프로필 이미지 URL을 변경할 수 있다`() {
            val member = memberFacade.findByEmail("user1@test.com")!!
            val newProfileImgUrl = "https://example.com/updated-profile.png"

            mvc
                .patch("/member/api/v1/adm/members/${member.id}/profileImgUrl") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "profileImgUrl": "$newProfileImgUrl"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1AdmMemberController::class.java))
                    match(handler().methodName("updateProfileImg"))
                    jsonPath("$.id") { value(member.id) }
                    jsonPath("$.profileImageUrl") {
                        value(startsWith(member.redirectToProfileImgUrlOrDefault))
                    }
                }

            val updatedMember = memberFacade.findById(member.id).orElseThrow()
            assertThat(updatedMember.profileImgUrl).isEqualTo(newProfileImgUrl)
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `회원 프로필 이미지 URL 변경에서 존재하지 않는 id를 보내면 404를 반환한다`() {
            mvc
                .patch("/member/api/v1/adm/members/999999/profileImgUrl") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "profileImgUrl": "https://example.com/updated-profile.png"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isNotFound() }
                    jsonPath("$.resultCode") { value("404-1") }
                    jsonPath("$.msg") { value("해당 데이터가 존재하지 않습니다.") }
                }
        }

        @Test
        @WithUserDetails("admin@test.com")
        fun `회원 프로필 이미지 URL 변경에서 profileImgUrl이 비어 있으면 400을 반환한다`() {
            mvc
                .patch("/member/api/v1/adm/members/1/profileImgUrl") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "profileImgUrl": ""
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-1") }
                }
        }

        @Test
        @WithUserDetails("user1@test.com")
        fun `회원 프로필 이미지 URL 변경에서 일반 사용자는 403을 반환한다`() {
            mvc
                .patch("/member/api/v1/adm/members/1/profileImgUrl") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "profileImgUrl": "https://example.com/updated-profile.png"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isForbidden() }
                    jsonPath("$.resultCode") { value("403-1") }
                    jsonPath("$.msg") { value("권한이 없습니다.") }
                }
        }

        @Test
        fun `회원 프로필 이미지 URL 변경에서 미인증 사용자는 401을 반환한다`() {
            mvc
                .patch("/member/api/v1/adm/members/1/profileImgUrl") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "profileImgUrl": "https://example.com/updated-profile.png"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isUnauthorized() }
                    jsonPath("$.resultCode") { value("401-1") }
                    jsonPath("$.msg") { value("로그인 후 이용해주세요.") }
                }
        }
    }
}
