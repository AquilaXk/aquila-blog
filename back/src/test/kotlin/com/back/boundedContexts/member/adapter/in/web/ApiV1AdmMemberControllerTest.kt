package com.back.boundedContexts.member.adapter.`in`.web

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.standard.dto.member.type1.MemberSearchSortType1
import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers.*
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
class ApiV1AdmMemberControllerTest {
    @Autowired
    private lateinit var mvc: MockMvc

    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Nested
    inner class GetItems {
        @Test
        @WithUserDetails("admin")
        fun `회원 목록 조회는 기본 페이지 설정으로 1페이지 결과를 반환한다`() {
            val members = memberFacade.findPagedByKw("", MemberSearchSortType1.CREATED_AT, 1, 30).content

            val resultActions =
                mvc
                    .get("/member/api/v1/adm/members")
                    .andExpect {
                        status { isOk() }
                        match(handler().handlerType(ApiV1AdmMemberController::class.java))
                        match(handler().methodName("getItems"))
                        jsonPath("$.content.length()") { value(members.size) }
                        jsonPath("$.pageable.pageNumber") { value(1) }
                        jsonPath("$.pageable.pageSize") { value(30) }
                    }

            members.forEachIndexed { index, member ->
                resultActions.andExpect {
                    jsonPath("$.content[$index].id") { value(member.id) }
                    jsonPath("$.content[$index].createdAt") { value(startsWith(member.createdAt.toString().take(20))) }
                    jsonPath("$.content[$index].modifiedAt") {
                        value(
                            startsWith(
                                member.modifiedAt.toString().take(20),
                            ),
                        )
                    }
                    jsonPath("$.content[$index].isAdmin") { value(member.isAdmin) }
                    jsonPath("$.content[$index].username") { value(member.username) }
                    jsonPath("$.content[$index].name") { value(member.name) }
                    jsonPath("$.content[$index].nickname") { value(member.nickname) }
                    jsonPath("$.content[$index].profileImageUrl") { value(startsWith(member.redirectToProfileImgUrlOrDefault)) }
                }
            }
        }

        @Test
        @WithUserDetails("admin")
        fun `회원 목록 조회는 username 과 nickname 을 통합해서 검색한다`() {
            memberFacade.join("android-a", "1234", "안드로이드 가이드", null)
            memberFacade.join("guide-search", "1234", "안드로이드 레시피", null)
            memberFacade.join("dev-guide", "1234", "개발 가이드", null)
            memberFacade.join("android-guide", "1234", "일반 사용자", null)

            mvc
                .get("/member/api/v1/adm/members") {
                    param("page", "1")
                    param("pageSize", "10")
                    param("kw", "android")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.content.length()") { value(2) }
                    jsonPath("$.content[*].username") { value(containsInAnyOrder("android-a", "android-guide")) }
                }
        }

        @Test
        @WithUserDetails("admin")
        fun `회원 목록 조회에 공백 검색어를 보내면 검색 없이 전체 1페이지 결과를 반환한다`() {
            val members = memberFacade.findPagedByKw("", MemberSearchSortType1.CREATED_AT, 1, 30).content

            mvc
                .get("/member/api/v1/adm/members") {
                    param("kw", "   ")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.content.length()") { value(members.size) }
                    jsonPath("$.pageable.pageNumber") { value(1) }
                    jsonPath("$.pageable.pageSize") { value(30) }
                }
        }

        @Test
        @WithUserDetails("admin")
        fun `회원 목록 조회에서 page 가 1보다 작으면 400을 반환한다`() {
            mvc
                .get("/member/api/v1/adm/members") {
                    param("page", "0")
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-1") }
                    jsonPath("$.msg") { value(containsString("page-Min-")) }
                }
        }

        @Test
        @WithUserDetails("admin")
        fun `회원 목록 조회에서 pageSize 가 30보다 크면 400을 반환한다`() {
            mvc
                .get("/member/api/v1/adm/members") {
                    param("pageSize", "31")
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-1") }
                    jsonPath("$.msg") { value(containsString("pageSize-Max-")) }
                }
        }

        @Test
        @WithUserDetails("user1")
        fun `회원 목록 조회에서 일반 사용자는 403을 반환한다`() {
            mvc
                .get("/member/api/v1/adm/members")
                .andExpect {
                    status { isForbidden() }
                    jsonPath("$.resultCode") { value("403-1") }
                    jsonPath("$.msg") { value("권한이 없습니다.") }
                }
        }

        @Test
        @WithUserDetails("admin")
        fun `회원 목록 조회는 프로필 role 과 bio 도 함께 hydrate 한다`() {
            val member = memberFacade.join("profile-list-user", "1234", "프로필 사용자", null)
            memberFacade.modifyProfileCard(member, "Backend Engineer", "회원 목록 hydrate 검증용 bio")

            mvc
                .get("/member/api/v1/adm/members") {
                    param("kw", "profile-list-user")
                    param("page", "1")
                    param("pageSize", "10")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.content.length()") { value(1) }
                    jsonPath("$.content[0].username") { value("profile-list-user") }
                    jsonPath("$.content[0].profileRole") { value("Backend Engineer") }
                    jsonPath("$.content[0].profileBio") { value("회원 목록 hydrate 검증용 bio") }
                }
        }
    }

    @Nested
    inner class GetItem {
        @Test
        @WithUserDetails("admin")
        fun `회원 단건 조회는 경로의 id 에 해당하는 회원 정보를 반환한다`() {
            val member = memberFacade.findByUsername("user1")!!

            mvc
                .get("/member/api/v1/adm/members/${member.id}")
                .andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1AdmMemberController::class.java))
                    match(handler().methodName("getItem"))
                    jsonPath("$.id") { value(member.id) }
                    jsonPath("$.createdAt") { value(startsWith(member.createdAt.toString().take(20))) }
                    jsonPath("$.modifiedAt") { value(startsWith(member.modifiedAt.toString().take(20))) }
                    jsonPath("$.isAdmin") { value(member.isAdmin) }
                    jsonPath("$.username") { value(member.username) }
                    jsonPath("$.name") { value(member.name) }
                    jsonPath("$.nickname") { value(member.nickname) }
                    jsonPath("$.profileImageUrl") { value(startsWith(member.redirectToProfileImgUrlOrDefault)) }
                }
        }

        @Test
        @WithUserDetails("admin")
        fun `회원 단건 조회에서 존재하지 않는 id 를 요청하면 404를 반환한다`() {
            mvc
                .get("/member/api/v1/adm/members/999999")
                .andExpect {
                    status { isNotFound() }
                    jsonPath("$.resultCode") { value("404-1") }
                    jsonPath("$.msg") { value("해당 데이터가 존재하지 않습니다.") }
                }
        }

        @Test
        @WithUserDetails("admin")
        fun `회원 단건 조회에서 id 가 0 이하이면 400을 반환한다`() {
            mvc
                .get("/member/api/v1/adm/members/0")
                .andExpect {
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-1") }
                    jsonPath("$.msg") { value(containsString("id-Positive-")) }
                }
        }

        @Test
        @WithUserDetails("user1")
        fun `회원 단건 조회에서 일반 사용자는 403을 반환한다`() {
            val member = memberFacade.findByUsername("user1")!!

            mvc
                .get("/member/api/v1/adm/members/${member.id}")
                .andExpect {
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
