package com.back.boundedContexts.member.adapter.`in`.web

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.support.SeededSpringBootTestSupport
import org.assertj.core.api.Assertions.assertThat
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
class ApiV1AdmMemberControllerTest : SeededSpringBootTestSupport() {
    @Autowired
    private lateinit var mvc: MockMvc

    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Nested
    inner class UpdateProfileCard {
        @Test
        @WithUserDetails("admin")
        fun `관리자는 회원 프로필 카드와 메인 소개 카드를 함께 수정할 수 있다`() {
            val member = memberFacade.findByUsername("admin")!!
            val newRole = "Backend Developer"
            val newBio = "블로그 운영자 소개 문구"
            val newIntroTitle = "aquilaXk's Backend Log"
            val newIntroDescription = "실전 백엔드 운영과 개발 메모를 남기는 공간입니다."

            mvc
                .patch("/member/api/v1/adm/members/${member.id}/profileCard") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "role": "$newRole",
                            "bio": "$newBio",
                            "homeIntroTitle": "$newIntroTitle",
                            "homeIntroDescription": "$newIntroDescription"
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
                }

            val updatedMember = memberFacade.findById(member.id).orElseThrow()
            assertThat(updatedMember.profileRole).isEqualTo(newRole)
            assertThat(updatedMember.profileBio).isEqualTo(newBio)
            assertThat(updatedMember.homeIntroTitle).isEqualTo(newIntroTitle)
            assertThat(updatedMember.homeIntroDescription).isEqualTo(newIntroDescription)
        }

        @Test
        @WithUserDetails("user1")
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
        @WithUserDetails("admin")
        fun `관리자는 회원 프로필 이미지 URL을 변경할 수 있다`() {
            val member = memberFacade.findByUsername("user1")!!
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
        @WithUserDetails("admin")
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
        @WithUserDetails("admin")
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
        @WithUserDetails("user1")
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
