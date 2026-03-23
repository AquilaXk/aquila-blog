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

    @Nested
    inner class UpdateProfileCard {
        @Test
        @WithUserDetails("admin@test.com")
        fun `관리자는 회원 프로필 카드와 메인 소개 카드를 함께 수정할 수 있다`() {
            val member = memberFacade.findByEmail("admin@test.com")!!
            val newRole = "Backend Developer"
            val newBio = "블로그 운영자 소개 문구"
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
