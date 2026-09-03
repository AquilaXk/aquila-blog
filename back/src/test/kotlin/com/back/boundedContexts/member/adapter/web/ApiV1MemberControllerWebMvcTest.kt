package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.global.security.config.AuthCookieNames
import com.back.support.BaseMemberControllerWebMvcTest
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.springframework.http.HttpHeaders
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler
import java.time.Instant

@org.junit.jupiter.api.DisplayName("ApiV1MemberControllerWebMvc 테스트")
class ApiV1MemberControllerWebMvcTest : BaseMemberControllerWebMvcTest() {
    @Nested
    inner class AdminProfile {
        @Test
        fun `관리자 프로필 조회는 잘못된 인증 정보가 있어도 공개 응답을 반환한다`() {
            val adminMember = sampleMember(id = 1, username = "admin", nickname = "관리자")
            val workspace =
                MemberProfileWorkspaceContent(
                    profileImageUrl = "https://example.com/admin.png",
                    profileRole = "블로그 운영자",
                    profileBio = "소개",
                    aboutRole = "Platform Engineer",
                    aboutBio = "상세 About 소개",
                    blogTitle = "aquilaXk's Archive",
                    homeIntroTitle = "aquilaXk's Blog",
                    homeIntroDescription = "welcome to my backend dev log!",
                    blogDesign = "grid",
                    legacyBlogScheme = "light",
                )
            given(memberUseCase.findByEmail("admin@test.com")).willReturn(adminMember)
            given(canonicalAdminPolicy.canAuthenticate(adminMember)).willReturn(true)
            given(currentMemberProfileQueryUseCase.getPublishedById(adminMember.id))
                .willReturn(MemberWithUsernameDto(adminMember, workspace, adminMember.modifiedAt))

            mvc
                .get("/member/api/v1/members/adminProfile") {
                    cookie(Cookie(AuthCookieNames.API_KEY, "invalid-api-key"))
                    cookie(Cookie(AuthCookieNames.ACCESS_TOKEN, "invalid-access-token"))
                    header(HttpHeaders.AUTHORIZATION, "Bearer invalid-api-key invalid-access-token")
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1MemberController::class.java))
                    match(handler().methodName("getAdminProfile"))
                    jsonPath("$.username") { value(adminMember.name) }
                    jsonPath("$.nickname") { value(adminMember.nickname) }
                    jsonPath("$.profileRole") { value("블로그 운영자") }
                    jsonPath("$.profileBio") { value("소개") }
                    jsonPath("$.aboutRole") { value("Platform Engineer") }
                    jsonPath("$.aboutBio") { value("상세 About 소개") }
                    jsonPath("$.blogTitle") { value("aquilaXk's Archive") }
                    jsonPath("$.homeIntroTitle") { value("aquilaXk's Blog") }
                    jsonPath("$.homeIntroDescription") { value("welcome to my backend dev log!") }
                    jsonPath("$.blogDesign") { value("grid") }
                    jsonPath("$.legacyBlogScheme") { value("light") }
                    jsonPath("$.profileImageUrl") { value("https://example.com/admin.png?v=${adminMember.modifiedAt.toEpochMilli()}") }
                    jsonPath("$.profileImageDirectUrl") { doesNotExist() }
                }
        }

        @Test
        fun `설정 이메일의 일반 회원은 관리자 프로필로 노출하지 않는다`() {
            val ordinaryMember = sampleMember(id = 2, username = "ordinary", nickname = "일반 회원")
            given(memberUseCase.findByEmail("admin@test.com")).willReturn(ordinaryMember)

            mvc
                .get("/member/api/v1/members/adminProfile")
                .andExpect {
                    status { isNotFound() }
                }
        }
    }

    @Nested
    inner class RedirectToProfileImg {
        @Test
        fun `프로필 이미지 리다이렉트 route는 존재하지 않는다`() {
            mvc
                .get("/member/api/v1/members/7/redirectToProfileImg")
                .andExpect {
                    status { isNotFound() }
                }
        }
    }

    @Nested
    inner class RandomSecureTip {
        @Test
        fun `회원가입 보안 팁 route는 존재하지 않는다`() {
            mvc
                .get("/member/api/v1/members/randomSecureTip")
                .andExpect {
                    status { isNotFound() }
                }
        }
    }

    private fun sampleMember(
        id: Long,
        username: String,
        nickname: String,
    ): Member {
        val member =
            Member(
                id = id,
                username = username,
                password = null,
                nickname = nickname,
                email = "$username@test.com",
            )
        member.createdAt = Instant.parse("2026-03-13T00:00:00Z")
        member.modifiedAt = Instant.parse("2026-03-13T00:01:00Z")
        return member
    }
}
